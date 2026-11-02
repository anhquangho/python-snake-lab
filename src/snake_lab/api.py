"""HTTP adapter: request -> dependency -> service/repository -> response model."""

import sqlite3
from collections.abc import Iterator
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response

from snake_lab.db import connect
from snake_lab.repository import ScoreRepository
from snake_lab.schemas import (
    LabStats,
    LeaderboardEntry,
    Mode,
    PlayerAnalytics,
    PlayerName,
    ScoreCreate,
    ScoreRead,
)
from snake_lab.service import RunConflictError, submit_score

router = APIRouter(prefix="/api", tags=["Snake Lab"])


def get_repository(request: Request) -> Iterator[ScoreRepository]:
    """Yield a request-scoped connection, then commit or roll back and close it."""
    with connect(request.app.state.database_path) as connection:
        yield ScoreRepository(connection)


Repository = Annotated[ScoreRepository, Depends(get_repository)]


@router.get("/health")
def health(repository: Repository) -> dict[str, str]:
    """Check readiness by executing a database query."""
    repository.connection.execute("SELECT 1").fetchone()
    return {"status": "ok"}


@router.post("/scores", response_model=ScoreRead, status_code=201)
def create_score(payload: ScoreCreate, response: Response, repository: Repository) -> ScoreRead:
    """201: created; 200: identical retry; 409: UUID conflict; 422: invalid input."""
    try:
        saved, created = submit_score(payload, repository)
    except RunConflictError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except sqlite3.OperationalError as error:
        raise HTTPException(
            status_code=503, detail="Database unavailable; retry this run"
        ) from error
    response.status_code = 201 if created else 200
    return saved


@router.get("/leaderboard", response_model=list[LeaderboardEntry])
def leaderboard(
    repository: Repository,
    mode: Mode = Mode.CLASSIC,
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
) -> list[LeaderboardEntry]:
    """Return the best run per nickname for the selected mode."""
    return repository.leaderboard(mode, limit)


@router.get("/players/{player_name}/analytics", response_model=PlayerAnalytics)
def player_analytics(
    player_name: PlayerName, repository: Repository, mode: Mode = Mode.CLASSIC
) -> PlayerAnalytics:
    """Return zero aggregates and an empty history for a nickname with no runs."""
    return repository.analytics(player_name, mode)


@router.get("/stats", response_model=LabStats)
def stats(repository: Repository) -> LabStats:
    """Return saved run count, distinct nicknames, and the highest score."""
    return repository.stats()
