# Python Snake Lab

**A familiar game, a Python backend to explore.** Browser-based Snake with a FastAPI REST API, SQLite persistence, player analytics, and tests.

This is a **personal learning project** for revisiting Python after time spent working with frontend JavaScript/Vue. It is a scaffold to read, experiment with, debug, and gradually make my own. It does not represent production Python experience, a commercial release, or a verified competitive game service. The initial scaffold was created with AI assistance; future changes should be described according to the work actually completed.

## What it does

- Plays a 20 × 20 Snake game with keyboard and on-screen direction controls.
- Offers Classic (140 ms/tick) and Sprint (90 ms/tick), with separate leaderboards.
- Pauses active play time, including when the tab becomes hidden or loses focus.
- Saves completed runs, calculates scores on the server, and retries without duplicating a run.
- Shows the best run per nickname, recent scores, average score, snacks eaten, active play time, and wins.
- Serves the frontend and API from one process; no Node build step or external database required.

## Run locally

Requires Python **3.12+**. Run from the repository root. These commands work in Windows PowerShell:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.lock
.\.venv\Scripts\python.exe -m pip install --no-build-isolation --no-deps -e .
.\.venv\Scripts\python.exe -m uvicorn snake_lab.main:app --reload
```

Open [the game](http://127.0.0.1:8000) or [interactive API docs](http://127.0.0.1:8000/docs). The first startup creates `data/snake-lab.sqlite3`. Restarting the app preserves saved runs. Stop with **Ctrl+C**.

On macOS/Linux, create the environment with `python3 -m venv .venv`, and replace `.\.venv\Scripts\python.exe` with `.venv/bin/python` in subsequent commands. The lock file records the development environment used for local verification; CI is configured to check Python 3.12/3.13 on Ubuntu and Windows.

For a small runtime-only installation, use `python -m pip install .` in your chosen environment. This resolves dependencies from the ranges in `pyproject.toml`, rather than the development lock file.

## Test

```powershell
.\.venv\Scripts\python.exe -m pytest --cov=snake_lab --cov-report=term-missing --cov-fail-under=90
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m ruff format --check .
node --test tests/frontend/engine.test.mjs
```

Node **22+** is optional for playing and required only for the standalone frontend engine tests. Python tests use temporary SQLite files, including persistence, rollback, validation, aggregate queries, and concurrent idempotent retries. They never use the player's local database. See [verification notes](docs/VERIFICATION.md) for what was actually run; a workflow file is not proof that GitHub Actions has run.

## Architecture

```text
Browser: Canvas + plain JavaScript
   │  JSON over HTTP (same origin)
   ▼
api.py          route adapters and connection dependency
   ├─ schemas.py    runtime input/output validation
   ├─ service.py    scoring and idempotency rules
   └─ repository.py SQL inserts, ranking, and analytics
          └─ db.py  per-request connection + transactions
                       └─ SQLite file
main.py         application factory, startup, static files
```

Raw `sqlite3` deliberately makes SQL and transactions visible. Synchronous routes keep blocking SQLite calls out of async handlers. A per-request connection closes after use; there is no shared global connection. The frontend stays small to keep the Python backend the main learning surface.

## API at a glance

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health` | DB query readiness check |
| POST | `/api/scores` | Save a finished run; `201` new, `200` identical retry, `409` conflicting run ID |
| GET | `/api/leaderboard?mode=classic&limit=10` | Best run per nickname; limit 1–50 |
| GET | `/api/players/alice/analytics?mode=classic` | Aggregates plus 10 newest runs |
| GET | `/api/stats` | Total saved runs, distinct nicknames, highest score |

`POST /api/scores` accepts a UUID `run_id`, `player_name`, `mode`, `food_eaten`, `duration_ms`, and `outcome`. It does **not** accept a client-supplied `score`. Scoring is `food_eaten × 10`. See [API examples and contracts](docs/API.md).

## Learn by changing it

The source, learning material, and exercises are written in English:

1. [Windows setup and first run](docs/WINDOWS_SETUP.md)
2. [Code reading map, with JavaScript comparisons](docs/CODE_READING_MAP.md)
3. [Architecture and data decisions](docs/ARCHITECTURE.md)
4. [Progressive exercises](docs/EXERCISES.md)
5. [Debugging scenarios](docs/DEBUGGING.md)
6. [GitHub preparation and honest portfolio wording](docs/GITHUB.md)

Start with `service.calculate_score`, trace one score submission end to end, then pick one exercise and add a test before changing behavior.

## Boundaries

- Nicknames are public shared labels, **not authenticated identities**. Anyone can submit under the same handle.
- Food counts and durations are client-reported. Deriving the score and validating input does **not** prevent cheating. There is no authoritative replay, authentication, rate limiting, or public deployment hardening.
- Unfinished runs are not saved. Failed submissions remain in memory for retry with the same UUID; closing the tab can lose the pending run. There is no offline queue.
- SQLite is appropriate for a small local lab. There is no multi-host deployment, migration framework, retention policy, or production operations claim.
- Analytics describe submitted runs, not unique people, real traffic, or engagement metrics.

The repository is prepared for local use and GitHub review. No repository license has been selected yet. Public hosting and a live demo are not included.
