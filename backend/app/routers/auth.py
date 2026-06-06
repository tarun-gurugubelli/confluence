from fastapi import APIRouter, Depends

from ..config import Settings, get_settings
from ..models import VerifyPasswordRequest, VerifyPasswordResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/verify", response_model=VerifyPasswordResponse)
def verify_password(
    req: VerifyPasswordRequest,
    settings: Settings = Depends(get_settings),
) -> VerifyPasswordResponse:
    return VerifyPasswordResponse(valid=req.password == settings.registration_password)
