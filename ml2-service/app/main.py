from fastapi import FastAPI

from app.api.routes import router as api_router
from app.core.config import settings
from app.core.logging import configure_logging


def create_app() -> FastAPI:
    configure_logging()
    app = FastAPI(title=settings.service_name, version=settings.service_version)
    app.include_router(api_router)
    return app


app = create_app()
