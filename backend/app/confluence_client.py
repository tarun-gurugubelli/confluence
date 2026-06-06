from typing import Optional
from urllib.parse import urlparse

import httpx

from .config import Settings


class ConfluenceError(Exception):
    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        self.message = message
        super().__init__(message)


class ConfluenceClient:
    """Thin wrapper around Confluence Cloud REST API (v2 with v1 fallback for space create)."""

    def __init__(self, settings: Settings):
        self.base = settings.confluence_base_url.rstrip("/")
        self.auth = (settings.confluence_email, settings.confluence_api_token)

    def _request(self, method: str, url: str, **kwargs) -> dict:
        with httpx.Client(
            auth=self.auth,
            timeout=30.0,
            headers={"Accept": "application/json"},
        ) as client:
            resp = client.request(method, url, **kwargs)
        if resp.status_code >= 400:
            raise ConfluenceError(resp.status_code, resp.text)
        if not resp.content:
            return {}
        return resp.json()

    def _v2(self, path: str) -> str:
        return f"{self.base}/api/v2/{path.lstrip('/')}"

    def _v1(self, path: str) -> str:
        return f"{self.base}/rest/api/{path.lstrip('/')}"

    def _next_link(self, data: dict) -> Optional[str]:
        nxt = (data.get("_links") or {}).get("next")
        if not nxt:
            return None
        if nxt.startswith("http"):
            return nxt
        parsed = urlparse(self.base)
        return f"{parsed.scheme}://{parsed.netloc}{nxt}"

    # ----- Spaces ---------------------------------------------------------
    def list_spaces(self) -> list[dict]:
        results: list[dict] = []
        url = self._v2("spaces?limit=250")
        while url:
            data = self._request("GET", url)
            results.extend(data.get("results", []))
            url = self._next_link(data)
        return results

    def get_space(self, space_id: str) -> dict:
        return self._request("GET", self._v2(f"spaces/{space_id}"))

    def create_space(self, key: str, name: str, description: Optional[str] = None) -> dict:
        body: dict = {"key": key, "name": name}
        if description:
            body["description"] = {
                "plain": {"value": description, "representation": "plain"}
            }
        return self._request("POST", self._v1("space"), json=body)

    # ----- Pages ----------------------------------------------------------
    def list_space_pages(self, space_id: str) -> list[dict]:
        results: list[dict] = []
        url = self._v2(f"spaces/{space_id}/pages?limit=250")
        while url:
            data = self._request("GET", url)
            results.extend(data.get("results", []))
            url = self._next_link(data)
        return results

    def get_page(self, page_id: str, body_format: str = "storage") -> dict:
        return self._request(
            "GET", self._v2(f"pages/{page_id}?body-format={body_format}")
        )

    def create_page(
        self,
        space_id: str,
        title: str,
        body_html: str = "",
        parent_id: Optional[str] = None,
    ) -> dict:
        body: dict = {
            "spaceId": space_id,
            "status": "current",
            "title": title,
            "body": {"representation": "storage", "value": body_html or ""},
        }
        if parent_id:
            body["parentId"] = parent_id
        return self._request("POST", self._v2("pages"), json=body)

    # ----- Folders --------------------------------------------------------
    def get_folder(self, folder_id: str) -> dict:
        return self._request("GET", self._v2(f"folders/{folder_id}"))

    def create_folder(
        self, space_id: str, title: str, parent_id: Optional[str] = None
    ) -> dict:
        body: dict = {"spaceId": space_id, "title": title}
        if parent_id:
            body["parentId"] = parent_id
        return self._request("POST", self._v2("folders"), json=body)

    # ----- Tree assembly --------------------------------------------------
    def build_space_tree(self, space: dict) -> dict:
        space_id = str(space["id"])
        space_node: dict = {
            "id": space_id,
            "type": "space",
            "title": space.get("name") or space.get("key") or "Space",
            "space_id": space_id,
            "space_key": space.get("key"),
            "parent_id": None,
            "children": [],
        }

        try:
            pages = self.list_space_pages(space_id)
        except ConfluenceError:
            pages = []

        nodes: dict[str, dict] = {}
        for page in pages:
            pid = str(page["id"])
            nodes[pid] = {
                "id": pid,
                "type": "page",
                "title": page.get("title") or "Untitled",
                "space_id": space_id,
                "space_key": space.get("key"),
                "parent_id": str(page["parentId"]) if page.get("parentId") else None,
                "_parent_type": page.get("parentType"),
                "children": [],
            }

        to_resolve = {
            str(p["parentId"])
            for p in pages
            if p.get("parentType") == "folder" and p.get("parentId")
        }
        resolved: set[str] = set()
        while to_resolve:
            fid = to_resolve.pop()
            if fid in resolved or fid in nodes:
                continue
            resolved.add(fid)
            try:
                folder = self.get_folder(fid)
            except ConfluenceError:
                continue
            nodes[fid] = {
                "id": fid,
                "type": "folder",
                "title": folder.get("title") or "Folder",
                "space_id": space_id,
                "space_key": space.get("key"),
                "parent_id": str(folder["parentId"]) if folder.get("parentId") else None,
                "_parent_type": folder.get("parentType"),
                "children": [],
            }
            if folder.get("parentType") == "folder" and folder.get("parentId"):
                to_resolve.add(str(folder["parentId"]))

        for node in nodes.values():
            parent_id = node.get("parent_id")
            parent_type = node.get("_parent_type")
            if parent_id and parent_type in ("page", "folder") and parent_id in nodes:
                nodes[parent_id]["children"].append(node)
            else:
                space_node["children"].append(node)

        def finalize(n: dict) -> None:
            n.pop("_parent_type", None)
            n["children"].sort(key=lambda c: (c["type"] != "folder", c["title"].lower()))
            for child in n["children"]:
                finalize(child)

        finalize(space_node)
        return space_node
