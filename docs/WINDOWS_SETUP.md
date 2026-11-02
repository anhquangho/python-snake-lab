# Run and learn on Windows

## 1. Open the project

Open `python-snake-lab.code-workspace` (or the `python-snake-lab` folder) in VS Code. Select **Terminal -> New Terminal** and choose PowerShell. Your current directory should contain `pyproject.toml`, `src`, and `tests`.

```powershell
Get-Location
Get-ChildItem
py -0p
```

Use Python 3.12 or newer. If your computer has `python` but no `py` launcher, check `python --version` and replace `py -3.12` below with `python`. If needed, install Python from [python.org](https://www.python.org/downloads/windows/), reopen the terminal, and check again.

## 2. Create an environment and install dependencies

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.lock
.\.venv\Scripts\python.exe -m pip install --no-build-isolation --no-deps -e .
```

`.venv` holds this project's installed dependencies. Keep it out of Git. The `-e .` option installs the package in editable mode, so changes in `src` do not require reinstalling it. Reinstall when package metadata or dependencies change.

There is no need to activate the environment or change PowerShell's execution policy. These commands use its Python interpreter directly. In VS Code, run **Python: Select Interpreter** and choose `.venv\Scripts\python.exe`.

## 3. Start the game

```powershell
.\.venv\Scripts\python.exe -m uvicorn snake_lab.main:app --reload
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). `snake_lab.main:app` means the `app` variable in the `snake_lab.main` module. `--reload` restarts the server when Python files change. Refresh the browser after editing HTML, CSS, or JavaScript. Keep the terminal open while playing; stop the server with **Ctrl+C**.

Choose a handle with 2-20 ASCII letters, numbers, underscores, or hyphens. Pick a pace and press Start. Use arrow keys, WASD, or the on-screen controls. Space/Pause stops movement and active play time; switching tabs also pauses. Hitting a wall or the snake's body ends the run and submits it automatically. A zero-point run is valid.

If saving fails, keep the tab open and choose **Retry saving**. The UUID stays the same, so a retry cannot create a duplicate run. **Discard unsaved run** clears the pending payload from this tab.

Explore [Swagger UI](http://127.0.0.1:8000/docs) to call the API directly. The first startup creates `data\snake-lab.sqlite3`; there are no synthetic players or scores on a fresh database.

## 4. Check your changes

```powershell
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m pytest tests/test_api.py -k retry -vv
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m ruff format --check .
```

To apply formatting, run `.\.venv\Scripts\python.exe -m ruff format .`. Node is only needed for game-engine tests:

```powershell
node --version
node --test tests/frontend/engine.test.mjs
```

## 5. Try the API in PowerShell

Open a second terminal while the server is running:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/health
$run = @{
    run_id = [guid]::NewGuid().ToString()
    player_name = 'learner'
    mode = 'classic'
    food_eaten = 4
    duration_ms = 12000
    outcome = 'collision'
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/api/scores -ContentType 'application/json' -Body $run
Invoke-RestMethod 'http://127.0.0.1:8000/api/players/learner/analytics?mode=classic'
```

This example writes sample data into the running application's database. Pytest uses separate temporary databases. Do not use sensitive information as a handle.

## 6. Change the database or port

Stop the server first, then run:

```powershell
$env:SNAKE_DB_PATH = "$PWD\data\practice.sqlite3"
.\.venv\Scripts\python.exe -m uvicorn snake_lab.main:app --reload --port 8001
```

Open port 8001 in your browser. This environment variable only affects the current terminal. Remove the override with `Remove-Item Env:SNAKE_DB_PATH`. The setting is a file path, not a connection URL. The application does not automatically read `.env` files.

## 7. Troubleshooting

| Symptom | What to check |
| --- | --- |
| `No module named snake_lab` | Use the `.venv` interpreter and install the package with `-e .`. |
| `No module named uvicorn` | Install the dependencies with the same interpreter used to run the server. |
| `WinError 10048` | Another process is using the port; try `--port 8001`. |
| `422 Unprocessable Entity` | Inspect the response's `detail` in Swagger or the browser Network panel. Change one input at a time. |
| Empty leaderboard | Check whether the run ended and saved, and whether the mode, handle, and database are correct. |
| `503` while saving | Close any open write transaction in a database viewer, then retry the same run. |
| Pip cannot download | Check your network/proxy. Try `--no-cache-dir --index-url https://pypi.org/simple` if the default index or cache is broken. Keep TLS verification enabled. |
| UI changes do not appear | Refresh the browser and confirm the server directory and port. |

For a fresh database, stop the server and select a new `SNAKE_DB_PATH`; keep the old file for comparison. When backing up a WAL database, stop the server and close database tools first, or use SQLite's backup API. Copying only the main file while a writer is active may omit recent changes.
