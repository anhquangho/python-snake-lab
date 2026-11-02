"""Unit tests for scoring without HTTP, SQLite, or a browser."""

import pytest

from snake_lab.service import calculate_score


@pytest.mark.parametrize(("food", "expected"), [(0, 0), (1, 10), (27, 270), (397, 3970)])
def test_calculate_score(food: int, expected: int) -> None:
    assert calculate_score(food) == expected


@pytest.mark.parametrize("food", [-1, 398, 1.5, "3", True, None])
def test_invalid_food_is_rejected(food: object) -> None:
    with pytest.raises(ValueError):
        calculate_score(food)  # type: ignore[arg-type]
