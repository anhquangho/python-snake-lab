# Progressive exercises

These TODOs are for you to implement. The current scaffold should run with passing tests before any exercise is completed. Use one branch or commit per exercise: write a test, watch it fail, implement the change, make it pass, and record what you learned. Solutions are intentionally left open.

## Level 1: revisit Python without changing the database

- [ ] **TODO-01: Python duration formatter.** Add `format_duration(duration_ms: int) -> str` in a new `formatting.py` module. Test 0, 999, 1000, 61000, negative inputs, and booleans. Keep the API's numeric `duration_ms` contract; do not wire the formatter into it yet. Practice `//`, `%`, f-strings, and type checks.
- [ ] **TODO-02: win rate.** Add `win_rate: float` (0-100, rounded to two decimals) to `PlayerAnalytics`. Update `schemas.PlayerAnalytics`, `repository.analytics`, and tests for an empty history and one win out of three runs. Avoid division by zero. Decide whether SQL or Python expresses the calculation more clearly.
- [ ] **TODO-03: retry examples.** Add tests showing that mixed-case handles share analytics and that reusing a UUID with another mode returns 409. Read `model_validator`, tuples, and `getattr` in `submit_score`. The original run must remain unchanged and total runs must remain one.

## Level 2: API and SQL

- [ ] **TODO-04: mode filter for lab stats.** Extend `api.stats` and `ScoreRepository.stats` with an optional `mode` filter. Omitting it must preserve the existing behavior. Test mixed modes, each filter, and an invalid mode. Keep user input out of SQL string construction.
- [ ] **TODO-05: paginated history.** Add `GET /api/players/{player_name}/runs?mode=classic&limit=10&offset=0`. Test an empty history, first/last pages, invalid bounds, and no overlapping rows when paginating unchanged data. Preserve analytics' existing 10-run history. Practice `Annotated`, `Query`, and `LIMIT/OFFSET`.
- [ ] **TODO-06: pure analytics function.** Summarize a list of scores in a Python module and compare its output with SQL using the same test data. Keep the existing SQL implementation. Practice comprehensions, `sum`, `max(default=...)`, and handling an empty list.

## Level 3: debugging and durable data

- [ ] **TODO-07: reproduce a bug.** Follow [DEBUGGING.md](DEBUGGING.md): replace `SUM` with `MAX`, identify the root cause through a failing test and breakpoint, then restore the correct query. Write five lines covering symptom, input, root cause, fix, and regression protection. Do not change the assertion to accept the bug.
- [ ] **TODO-08: daily activity.** Aggregate runs by UTC day for the last seven days. Decide whether missing days return zeros or are omitted before implementing it. Define UTC boundaries and inject a clock or use fixed timestamps. Tests must not depend on the computer's current date.
- [ ] **TODO-09: first migration.** Add `schema_version` and migrate an old database fixture. Existing data must survive; running startup twice must not repeat the migration; a failure must not leave partial data. Investigate `executescript` transaction behavior before designing it.

## Level 4: connect the frontend and backend

- [ ] **TODO-10: durable pending queue.** Persist unconfirmed payloads in localStorage. After reload, offer Retry using the same UUID. Test a lost response after commit, offline mode, invalid stored JSON, and UUID conflict. Clear data only after confirmation or an explicit discard. Do not add auth token storage to this exercise.
- [ ] **TODO-11: API service module.** Extract fetch calls into `api.mjs`. Mock fetch to test timeouts, non-2xx responses, and invalid JSON. A Vue rewrite is not required for this exercise.
- [ ] **TODO-12: optional Vue client.** Once the Python flow is clear, build a separate Vue frontend using the existing API. Decide on a same-origin proxy or explicit CORS policy first. Compare the changes without silently changing the backend contract.

## Level 5: make the portfolio your own

- [ ] Finish **one** exercise and add a `My changes` section to README describing work actually completed, with its test or commit.
- [ ] Explain one trade-off you decided and an alternative you considered.
- [ ] Record a short demo: play, inspect the saved SQLite run, query analytics, and run your added test.
- [ ] Explain why the project is not a production multiplayer game or cheat-proof leaderboard.

You do not need to finish everything before sharing the repository. A small improvement with a test and a clear explanation demonstrates understanding better than an unfinished feature list.
