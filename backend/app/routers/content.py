from fastapi import APIRouter, Depends

from ..auth import require_registration_password
from ..models import (
    CreatedResponse,
    CreateFolderRequest,
    CreatePageRequest,
    PageDetail,
)
from ..service import ContentService, get_service

router = APIRouter(prefix="/api", tags=["content"])


@router.get("/pages/{page_id}", response_model=PageDetail)
def get_page(
    page_id: str, service: ContentService = Depends(get_service)
) -> PageDetail:
    return PageDetail(**service.get_page(page_id))


@router.post(
    "/folders",
    response_model=CreatedResponse,
    dependencies=[Depends(require_registration_password)],
)
def create_folder(
    req: CreateFolderRequest, service: ContentService = Depends(get_service)
) -> CreatedResponse:
    created = service.create_folder(
        space_id=req.space_id, title=req.title, parent_id=req.parent_id
    )
    return CreatedResponse(**created)


@router.post(
    "/pages",
    response_model=CreatedResponse,
    dependencies=[Depends(require_registration_password)],
)
def create_page(
    req: CreatePageRequest, service: ContentService = Depends(get_service)
) -> CreatedResponse:
    created = service.create_page(
        space_id=req.space_id,
        title=req.title,
        body_html=req.body_html,
        parent_id=req.parent_id,
    )
    return CreatedResponse(**created)
