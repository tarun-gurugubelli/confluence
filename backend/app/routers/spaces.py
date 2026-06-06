from fastapi import APIRouter, Depends

from ..auth import require_registration_password
from ..models import CreatedResponse, CreateSpaceRequest, SpaceSummary, TreeNode
from ..service import ContentService, get_service

router = APIRouter(prefix="/api/spaces", tags=["spaces"])


@router.get("", response_model=list[SpaceSummary])
def list_spaces(service: ContentService = Depends(get_service)) -> list[SpaceSummary]:
    return [SpaceSummary(**s) for s in service.list_spaces()]


@router.get("/{space_id}/tree", response_model=TreeNode)
def get_space_tree(
    space_id: str, service: ContentService = Depends(get_service)
) -> TreeNode:
    return TreeNode(**service.get_tree(space_id))


@router.post(
    "",
    response_model=CreatedResponse,
    dependencies=[Depends(require_registration_password)],
)
def create_space(
    req: CreateSpaceRequest, service: ContentService = Depends(get_service)
) -> CreatedResponse:
    created = service.create_space(
        key=req.key, name=req.name, description=req.description
    )
    return CreatedResponse(**created)
