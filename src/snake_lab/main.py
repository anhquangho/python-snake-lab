"""Composition root: wire the layers while keeping business rules outside the app."""

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from snake_lab.api import router
from snake_lab.db import initialize


def create_app(database_path: Path | None = None) -> FastAPI:
    """Accept a database path so tests never need to use the player's database.

    The default database is relative to the working directory. SNAKE_DB_PATH can be
    an absolute path. Frontend assets use a package path independent of the cwd.
    """
    path = database_path or Path(os.environ.get("SNAKE_DB_PATH", "data/snake-lab.sqlite3"))

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        initialize(app.state.database_path)
        yield

    app = FastAPI(
        title="Python Snake Lab",
        description="Personal learning project. Client-reported scores; no authentication.",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.state.database_path = path.resolve()
    app.include_router(router)
    # Mount the catch-all last so it cannot hide /api, /docs, or /openapi.json.
    app.mount("/", StaticFiles(directory=Path(__file__).parent / "static", html=True), name="web")
    return app


app = create_app()
