# Debugging practice

## Follow one request through Python

1. Run the local server and open `/docs`.
2. Place breakpoints in `service.submit_score` and `repository.insert_or_get` in VS Code.
3. Choose **Python: FastAPI lab** under Run and Debug. Stop any server already using the port. The debug configuration deliberately omits `--reload` to avoid child-process breakpoint confusion.
4. Submit a valid payload. Inspect `payload`, `saved`, and `created`; step into scoring and repository calls.
5. Submit it again with the same UUID, then change `food_eaten`. Predict 201, 200, and 409 before making each request.

## Debug a test instead of the server

Choose **Python: pytest current file** while a test file is open. Alternatively:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_api.py -k aggregates -vv --pdb
```

In pdb, try `p analytics`, `where`, `next`, `step`, `continue`, and `quit`. `--pdb` enters the debugger on failure, so introduce a controlled bug first if the test currently passes.

## Bug A: analytics only reports the largest food count

Temporarily replace `SUM(food_eaten)` with `MAX(food_eaten)` in `ScoreRepository.analytics`. Run the aggregate test. Predict expected 66 versus actual 11. Identify the incorrect SQL aggregate instead of changing the expected result. Restore the query and rerun. Record symptom, input, root cause, fix, and regression test.

## Bug B: double counting after a network problem

Submit the same UUID twice through Swagger UI: `games_played` should stay one. Temporarily removing `ON CONFLICT` produces an error; generating a new UUID on Retry is not the fix. Read `test_concurrent_retry_creates_one_run` to see why a separate pre-check SELECT followed by INSERT cannot alone prevent races. Restore experimental edits afterward.

## Bug C: the leaderboard differs from expectations

Create two runs with equal scores and different durations. Inspect the Network request's `mode` parameter, then read the SQL tie-break. `completed_at` is the server submission time, not active duration. Confirm the displayed mode before blaming the query.

## Bug D: saving a run fails

Start the app, begin a run, then pause. Stop the backend, resume, and let the snake hit a wall. The UI should report an unconfirmed save and offer Retry/Discard. Restart the backend with the same database and retry. Confirm that the UUID is unchanged and the run count increases once. The pending payload is only in memory: keep the tab open without refreshing during this experiment.

## Bug E: game input

While moving right, press Up and Left rapidly before the next tick. `app.mjs` accepts only one turn per tick, and `engine.step` also blocks reversal. Engine tests protect pure rules; browser checks are still needed for keyboard handling, focus, and timers. Typing WASD into a focused handle input must not control the game.

After each experiment, restore the deliberately introduced bug and run pytest plus game-engine tests. Keep experimental failures out of `main`.
