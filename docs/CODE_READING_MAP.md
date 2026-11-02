# Code reading map: from frontend work to Python

The goal is to explain one request in your own words, change a rule, and verify it with a test. You do not need to read the entire repository at once.

## Pass 1: small Python functions without a framework

Read `src/snake_lab/service.py`, starting with `calculate_score`, then open `tests/test_service.py`.

| Python in this repository | JavaScript/Vue comparison |
| --- | --- |
| `def calculate_score(food_eaten: int) -> int` | An annotated function, similar to TypeScript. Python annotations usually do not validate inputs by themselves. |
| `raise ValueError(...)` | Similar to `throw new Error(...)`. |
| `type(x) is int` | An exact type check. Python's `bool` subclasses `int`, so `True` needs explicit rejection here. |
| `@pytest.mark.parametrize(...)` | Run one test with several input sets, similar to `test.each`. |
| `list[ScoreRead]`, `Path | None` | Generic lists and union types. |

Predict the results for `0`, `3`, `397`, and `True`, then run the tests. Place a breakpoint in `calculate_score` and use **Debug Test** in VS Code with the Python extension.

## Pass 2: follow one POST request

Read in this order, using Go to Definition:

1. `schemas.ScoreCreate`: which fields exist, what happens to missing/extra fields, and why does the API reject `score`?
2. `api.create_score`: how is `repository` injected, and where does 201 become 200?
3. `service.submit_score`: calculate points and compare payloads when a UUID already exists.
4. `repository.ScoreRepository.insert_or_get`: bound SQL parameters, UTC timestamps, and a UNIQUE UUID.
5. `api.get_repository` -> `db.connect`: enter/exit a transaction and close the connection.
6. `tests/test_api.py` -> `test_retry_is_idempotent_and_conflict_preserves_original`: read a test as an executable API example.

Sketch **JSON -> ScoreCreate -> service -> repository -> SQLite -> ScoreRead -> JSON**. Include the 422, 409, and 503 error paths.

## Pass 3: return to the entry point

Read `main.create_app` and `db.initialize`. Compared with Vue, `create_app` is the bootstrap that wires dependencies together, rather than a component. `app.state` stores the database path, not each player's game state.

`lifespan` contains a `yield`: code before it runs on startup; code after it runs on shutdown. `get_repository` also yields, but its lifetime is one request. `with connection` commits or rolls back a transaction; `connection.close()` releases the resource. These are separate responsibilities.

SQLite uses synchronous I/O, so the routes use `def`. FastAPI runs synchronous handlers in a threadpool. Changing them all to `async def` would not make SQLite calls asynchronous.

## Pass 4: ranking and analytics in SQL

Read `repository.leaderboard` and its test. It chooses each nickname's best run before ranking the whole board. Twenty runs from one nickname do not occupy twenty positions. Ties use shorter active time, then earlier insertion ID.

Read `repository.analytics`: explore `COUNT`, `MAX`, `AVG`, `SUM`, and `COALESCE`. Why does an unknown handle return zeros? Why aggregate **all runs** but return only **10 recent runs**? Queries use `?` placeholders with parameter tuples; handles are not inserted into SQL using f-strings.

## Pass 5: tests that leave player data alone

Read `tests/conftest.py`. Pytest finds fixtures by parameter name. `tmp_path` provides a directory for each test. The `client` fixture uses `with TestClient(...)` to run lifespan. Integration tests use actual SQLite files instead of mocking the database.

Temporarily replace `SUM(food_eaten)` with `MAX(food_eaten)`. Which test fails? Restore the query afterward. This helps distinguish assertions that protect behavior from tests that merely increase a count.

## Pass 6: the familiar frontend

Read `static/engine.mjs` before `static/app.mjs`. `step` is a pure function: it does not mutate the input state and knows nothing about DOM or HTTP. `app.mjs` handles timers, pause, focus, API submissions, and rendering. The backend does not run the game ticks, so scores are not cheat-proof.

Trace `finish` -> `saveRun` -> HTTP -> Python. Stop the server before gameover: the pending payload keeps its UUID, and Retry must not generate another one. Refreshing or closing the tab can lose that pending run. See the durable offline queue exercise.

## Check your understanding

- Why can someone else submit a run under your handle?
- Why is calculating the score on the server insufficient to prevent cheating?
- Does an HTTP 409 pass through transaction rollback?
- Why does `with sqlite3.connect(...)` alone not guarantee the connection closes?
- What multi-connection problem does a real temporary DB file avoid compared with `:memory:`?
- If food becomes worth 20 points, which code, database constraint, frontend, documentation, and tests must change?

Answer by pointing to specific functions and tests. Then choose one item in [EXERCISES.md](EXERCISES.md) and make your own small commit.
