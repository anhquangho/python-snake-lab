"""Plain Python business rules, independent of HTTP for easy testing and debugging."""

from snake_lab.repository import ScoreRepository
from snake_lab.schemas import ScoreCreate, ScoreRead

POINTS_PER_FOOD = 10


class RunConflictError(Exception):
    """The same run_id with different data cannot be treated as an identical retry."""


def calculate_score(food_eaten: int) -> int:
    """Award 10 points per food; reject bool, which is a subclass of int."""
    if type(food_eaten) is not int or not 0 <= food_eaten <= 397:
        raise ValueError("food_eaten must be an integer between 0 and 397")
    return food_eaten * POINTS_PER_FOOD


def submit_score(payload: ScoreCreate, repository: ScoreRepository) -> tuple[ScoreRead, bool]:
    """Return (saved_run, created); identical retries do not duplicate analytics."""
    saved, created = repository.insert_or_get(payload, calculate_score(payload.food_eaten))
    fields = ("run_id", "player_name", "mode", "food_eaten", "duration_ms", "outcome")
    if any(getattr(saved, field) != getattr(payload, field) for field in fields):
        raise RunConflictError("run_id already belongs to a different payload")
    return saved, created
