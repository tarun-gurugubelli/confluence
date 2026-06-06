from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from mangum import Mangum

from .config import get_settings
from .confluence_client import ConfluenceError
from .models import ConfigStatus
from .routers import auth, content, spaces

settings = get_settings()

app = FastAPI(title="Confluence Client API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(ConfluenceError)
def _confluence_error_handler(request: Request, exc: ConfluenceError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": f"Confluence API error: {exc.message[:500]}"},
    )


app.include_router(auth.router)
app.include_router(spaces.router)
app.include_router(content.router)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/config", response_model=ConfigStatus)
def config() -> ConfigStatus:
    return ConfigStatus(configured=get_settings().configured)


# AWS Lambda entry point (used by SAM / Function URL).
handler = Mangum(app, lifespan="off")
