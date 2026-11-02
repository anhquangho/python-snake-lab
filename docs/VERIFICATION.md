# Verification record

Checked locally on **2026-11-02** using Windows, Python **3.12.10**, Node **24.16.0**, FastAPI **0.162.0**, and SQLite from the Python standard library. Exact installed development versions are recorded in `requirements-dev.lock`.

## English source update

All source comments, docstrings, and learning documents were translated into English on the same date. The Windows guide is now `WINDOWS_SETUP.md` and the exercise list is `EXERCISES.md`; links were updated. Python AST comparison, excluding docstrings, confirmed that the translation did not change executable statements. A scan of publishable files found no remaining Vietnamese text.

After translation, all 51 Python tests and 9 game-engine tests passed again, with 100% Python statement coverage. Ruff lint and formatting checks passed. The restricted local environment required an explicit temporary directory and disabled pytest caching for this rerun; the normal command and CI configuration remain unchanged.

## Automated checks performed

| Check | Observed result |
| --- | --- |
| `python -m pytest --cov=snake_lab --cov-report=term-missing --cov-fail-under=90` | 51 passed; 100% Python statement coverage (163 statements) |
| `python -m ruff check .` | Passed |
| `python -m ruff format --check .` | Passed |
| `node --test tests/frontend/engine.test.mjs` | 9 passed |
| `python -m pip check` | No broken requirements |
| Build a Python wheel | Passed with `pip wheel --no-cache-dir --no-deps --no-build-isolation` |
| Install wheel into a separate target and run outside source root | HTML, CSS, app JS, engine JS, health and Swagger all returned 200 |

The Python suite covers score rules, invalid payloads, normalized nicknames, idempotent/concurrent retries, conflicting UUIDs, best-per-player ranking, tie-breaking, mode isolation, empty/populated analytics, bounded history, startup environment override, SQLite rollback/constraints, and persistence across application instances.

Coverage is statement coverage for the Python package. It is not branch coverage, frontend coverage, security certification, or evidence of production readiness.

One upstream warning remains: the installed Starlette TestClient warns that its `httpx` integration is deprecated in favor of `httpx2`. The tests currently pass with the locked environment; this warning has not been suppressed. A future test-client dependency migration should be a separate documented change.

## Browser checks performed

Uvicorn served the real application on loopback port 8765 with a separate `data/browser-qa.sqlite3` database. Chrome DevTools was used for DOM, interaction and viewport checks:

- Desktop at 1440px: frontend loaded, initial API-backed totals were zero, and the layout was visually inspected through a returned screenshot.
- Started a run, sent keyboard direction input, paused, waited, and confirmed the clock stayed unchanged and the handle was locked during play.
- Resumed into collision; UI reported `Run saved`, a leaderboard entry appeared, and saved run count increased.
- Selected Sprint and an uppercase handle; the handle normalized to lowercase and Classic/Sprint leaderboards returned separate entries.
- Mobile emulation at 390 × 844: document width was 390px with no horizontal overflow; canvas width was 320px; on-screen direction buttons were visible and one direction input was exercised.
- Emulated offline completion: UI reported `Failed to fetch`, showed Retry/Discard, and disabled starting a new run. After restoring connectivity, Retry saved the run; DB count increased from 3 to 4, then controls became available again.
- Observed Uvicorn logs show successful static/API requests (200/304) and successful run inserts (201). Offline fetch failure was intentional.

The final separate DevTools console/network inventory could not be collected because the tool became unresponsive after screenshot export attempts. No claim of a completed clean-console audit is made. Screenshot file export was denied by the tool's path policy; a background Chrome fallback was rejected by automatic approval review. No screenshot file is included or linked from README.

The temporary browser QA database was removed after stopping the owned preview server. The default player database is created fresh when the user first runs the app. QA did not seed production-style or invented player data into the repository.

## Not verified

- GitHub Actions execution: workflow is prepared, but no repository was pushed.
- Other Python versions and operating systems: configured in CI, not run locally here.
- Physical mobile devices, exhaustive accessibility, all browsers, multi-host/concurrent load, security hardening, authenticated identity or anti-cheat behavior.
- Public hosting: no deployment, account connection, remote repository or public push was performed.

## Documentation references used

- [FastAPI lifespan](https://fastapi.tiangolo.com/advanced/events/)
- [FastAPI testing lifespan with TestClient](https://fastapi.tiangolo.com/advanced/testing-events/)
- [FastAPI static files](https://fastapi.tiangolo.com/tutorial/static-files/)
- [pytest temporary directories](https://docs.pytest.org/en/stable/how-to/tmp_path.html)

FastAPI and pytest documentation was retrieved through Context7 during implementation.
