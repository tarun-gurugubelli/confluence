"""Service layer wrapping the Confluence client with consistent return shapes."""

from typing import Optional

from fastapi import Depends, HTTPException, status

from .config import Settings, get_settings
from .confluence_client import ConfluenceClient


def _normalize_space(raw: dict) -> dict:
    return {
        "id": str(raw["id"]),
        "key": raw.get("key", ""),
        "name": raw.get("name", ""),
        "type": raw.get("type"),
        "homepage_id": str(raw["homepageId"]) if raw.get("homepageId") else None,
    }


def _normalize_page(raw: dict) -> dict:
    body = ((raw.get("body") or {}).get("storage") or {}).get("value", "")
    version = (raw.get("version") or {}).get("number")
    return {
        "id": str(raw["id"]),
        "title": raw.get("title", ""),
        "space_id": str(raw["spaceId"]) if raw.get("spaceId") else None,
        "body_html": body or "",
        "version": version,
        "parent_id": str(raw["parentId"]) if raw.get("parentId") else None,
    }


class ContentService:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._client: Optional[ConfluenceClient] = (
            ConfluenceClient(settings) if settings.configured else None
        )

    def _require_client(self) -> ConfluenceClient:
        if self._client is None:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    "Confluence is not configured. Set CONFLUENCE_BASE_URL, "
                    "CONFLUENCE_EMAIL, and CONFLUENCE_API_TOKEN in the backend "
                    "environment."
                ),
            )
        return self._client

    # ----- Reads ----------------------------------------------------------
    def list_spaces(self) -> list[dict]:
        return [_normalize_space(s) for s in self._require_client().list_spaces()]

    def get_tree(self, space_id: str) -> dict:
        client = self._require_client()
        space = client.get_space(space_id)
        return client.build_space_tree(space)

    def get_page(self, page_id: str) -> dict:
        return _normalize_page(self._require_client().get_page(page_id))

    # ----- Writes ---------------------------------------------------------
    def create_space(self, key: str, name: str, description: Optional[str]) -> dict:
        raw = self._require_client().create_space(key=key, name=name, description=description)
        return {
            "id": str(raw.get("id") or raw.get("key") or key),
            "type": "space",
            "title": raw.get("name") or name,
        }

    def create_folder(
        self, space_id: str, title: str, parent_id: Optional[str]
    ) -> dict:
        raw = self._require_client().create_folder(
            space_id=space_id, title=title, parent_id=parent_id
        )
        return {"id": str(raw.get("id")), "type": "folder", "title": title}

    def create_page(
        self, space_id: str, title: str, body_html: str, parent_id: Optional[str]
    ) -> dict:
        raw = self._require_client().create_page(
            space_id=space_id,
            title=title,
            body_html=body_html,
            parent_id=parent_id,
        )
        return {"id": str(raw.get("id")), "type": "page", "title": title}


def get_service(settings: Settings = Depends(get_settings)) -> ContentService:
    return ContentService(settings)
