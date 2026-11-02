# Architecture and decisions

## Scope

This is a local, single-process application. The browser and API share an origin, so there is no frontend build step, CORS configuration, or required cloud account. Plain JavaScript keeps the main learning surface in Python. The standard-library `sqlite3` module makes queries and transaction handling visible without adding an ORM.

The backend separates responsibilities without introducing many abstraction layers: `main` composes the app, `api` adapts HTTP, `schemas` validates runtime contracts, `service` holds rules, `repository` runs SQL, and `db` owns connection lifecycle. Type hints and docstrings support reading; CI does not run mypy, so the project does not claim complete static type verification.

## Data model

One row represents one completed run. The browser creates `run_id` as a UUID. SQLite creates `id` for stable ordering. The server creates UTC `completed_at` **when it receives a submission**, not when gameplay begins. A delayed retry may therefore record a time later than the actual end of play.

Handles are trimmed and lowercased, with a normalized format of `[a-z0-9_-]{2,20}`. They are shared labels, not identities. Two people using the same handle share analytics. Modes are the `classic` and `sprint` enum values.

The board has 20 x 20 cells and an initial snake length of 3. A run can eat at most 397 food items; score is `food_eaten * 10`. The API accepts `won` only for 397 food, and `collision` only below that number. These checks validate internal consistency, not a replay of real gameplay. There is no verification of speed, movement history, or food count against elapsed time.

`duration_ms` is browser-reported active time measured with `performance.now()`, excluding pauses. The API accepts integer durations from 0 through 86,400,000 ms. Runs exceeding 24 hours are rejected on submission; multi-day runs are outside this lab's scope. The server does not authenticate the duration.

## Transactions and retries

Each request opens a separate connection with a five-second busy timeout. WAL supports local readers alongside a writer; SQLite still permits only one writer at a time. `check_same_thread=False` accommodates FastAPI's synchronous dependency/handler execution without sharing connections between requests.

The insert uses `ON CONFLICT(run_id) DO NOTHING`, then reads the row and compares its fields in the service. A new UUID returns 201; an identical normalized retry returns 200; a different payload using an existing UUID returns 409. A normal dependency exit commits the transaction; an exception rolls it back; both paths close the connection. Database constraints supplement schema validation.

The browser keeps an unconfirmed payload in memory and retries with its original UUID. If a response is lost after commit, another submission returns the saved row. Start remains disabled while a payload is pending; the player can Retry or Discard. This is not durable offline storage. The `beforeunload` prompt is a best-effort reminder and may not appear on every device.

## Leaderboard and analytics

There is one best run per handle and mode: highest score, then shortest active time, then earlier insertion ID. Ranks are sequential positions (1, 2, 3), not shared competition ranks.

Player analytics aggregate all runs for the selected handle and mode. The API returns at most 10 recent runs in descending ID order; the browser reverses them to draw oldest-to-newest bars. Chart heights are relative to the maximum among those runs, not directly comparable across players or modes. Zero scores have a small visible bar to indicate a recorded run.

Lab stats combine both modes. Distinct handles are not unique people. A fresh database starts at zero; no synthetic activity is presented as real usage.

## Possible next steps

Authentication requires decisions about ownership and existing shared-handle data. Anti-cheat requires authoritative gameplay or replay verification. Public hosting requires evaluating rate limits, backups, logging, error handling, retention, and privacy. Those capabilities are not implemented in this scaffold.

The schema uses `CREATE TABLE IF NOT EXISTS`, which is **not a migration system**. Editing the schema does not update old database files. While learning, use a new database path for incompatible changes and implement the migration exercise before relying on long-lived data.
