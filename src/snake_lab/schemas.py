"""API contracts: similar to TypeScript types, but validated at runtime."""

from datetime import datetime
from enum import StrEnum
from typing import Annotated, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

# A nickname is a shared public handle, not an account. Normalize before use.
PlayerName = Annotated[
    str,
    # The pattern runs before to_lower: accept A-Z, then normalize to lowercase.
    StringConstraints(strip_whitespace=True, to_lower=True, pattern=r"^[A-Za-z0-9_-]{2,20}$"),
]


class Mode(StrEnum):
    """Keep leaderboards separate because the game modes have different speeds."""

    CLASSIC = "classic"
    SPRINT = "sprint"


class Outcome(StrEnum):
    """A run ends on collision or when the snake fills the 20 x 20 board."""

    COLLISION = "collision"
    WON = "won"


class ScoreCreate(BaseModel):
    """Validate client-reported data; validation does not prove honest gameplay."""

    model_config = ConfigDict(extra="forbid")

    run_id: UUID
    player_name: PlayerName
    mode: Mode
    food_eaten: int = Field(strict=True, ge=0, le=397)
    duration_ms: int = Field(strict=True, ge=0, le=86_400_000)
    outcome: Outcome

    @model_validator(mode="after")
    def validate_outcome(self) -> Self:
        """397 food + 3 initial cells fills the board and must have outcome won."""
        if (self.food_eaten == 397) != (self.outcome == Outcome.WON):
            raise ValueError("won requires exactly 397 food; collision requires fewer")
        return self


class ScoreRead(BaseModel):
    """Return the server-derived score and server-generated UTC timestamp."""

    id: int
    run_id: UUID
    player_name: str
    mode: Mode
    score: int
    food_eaten: int
    duration_ms: int
    outcome: Outcome
    completed_at: datetime


class LeaderboardEntry(BaseModel):
    """Represent at most one best run per nickname in each mode."""

    rank: int
    player_name: str
    score: int
    duration_ms: int
    completed_at: datetime


class PlayerAnalytics(BaseModel):
    """Aggregate all runs for a nickname in the selected mode."""

    player_name: str
    mode: Mode
    games_played: int
    best_score: int
    average_score: float
    total_food: int
    total_duration_ms: int
    wins: int
    recent_runs: list[ScoreRead]


class LabStats(BaseModel):
    """Report stored data without presenting synthetic seed data as real players."""

    games_played: int
    players: int
    best_score: int
