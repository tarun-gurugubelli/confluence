from typing import Literal, Optional

from pydantic import BaseModel, Field

NodeType = Literal["space", "folder", "page"]


class TreeNode(BaseModel):
    id: str
    type: NodeType
    title: str
    space_id: Optional[str] = None
    space_key: Optional[str] = None
    parent_id: Optional[str] = None
    children: list["TreeNode"] = Field(default_factory=list)


TreeNode.model_rebuild()


class SpaceSummary(BaseModel):
    id: str
    key: str
    name: str
    type: Optional[str] = None
    homepage_id: Optional[str] = None


class PageDetail(BaseModel):
    id: str
    title: str
    space_id: Optional[str] = None
    body_html: str = ""
    version: Optional[int] = None
    parent_id: Optional[str] = None


class CreateSpaceRequest(BaseModel):
    key: str
    name: str
    description: Optional[str] = None


class CreateFolderRequest(BaseModel):
    space_id: str
    title: str
    parent_id: Optional[str] = None


class CreatePageRequest(BaseModel):
    space_id: str
    title: str
    body_html: str = ""
    parent_id: Optional[str] = None


class CreatedResponse(BaseModel):
    id: str
    type: NodeType
    title: str


class VerifyPasswordRequest(BaseModel):
    password: str


class VerifyPasswordResponse(BaseModel):
    valid: bool


class ConfigStatus(BaseModel):
    configured: bool
