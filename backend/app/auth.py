from fastapi import Depends, Header, HTTPException, status

from .config import Settings, get_settings


def require_registration_password(
    x_registration_password: str | None = Header(default=None, alias="X-Registration-Password"),
    settings: Settings = Depends(get_settings),
) -> None:
    if not x_registration_password or x_registration_password != settings.registration_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing registration password.",
        )
