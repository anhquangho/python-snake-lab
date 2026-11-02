# GitHub and portfolio guide

The repository is a personal learning project. Share the source files directly so reviewers can browse code, documentation, tests, and commit history. Uploading only a ZIP would hide most of that experience.

## Files that belong in the repository

- `src/`, `tests/`, `docs/`, README, and contribution guidance.
- `pyproject.toml` and `requirements-dev.lock` for installation.
- `.github/workflows/ci.yml`, editor settings, and the VS Code workspace.
- `.gitignore`, `.gitattributes`, and `.editorconfig`.

Virtual environments, player databases, caches, build outputs, credentials, and intermediate automation files are excluded. A source ZIP is a convenience download, not a substitute for tracked files.

## Review before each push

- [ ] Read the changed flow and make sure you can explain it.
- [ ] Keep README claims aligned with implemented and verified behavior.
- [ ] Run the README test and formatting commands.
- [ ] Inspect `git status --short`, `git diff`, and `git diff --cached`.
- [ ] Confirm no local data or secrets are staged.
- [ ] Choose a license if you want to grant reuse rights; no license has been selected for this scaffold. A public repository does not automatically grant an open-source license.

## Continue working locally

Use the Git identity you want associated with public commits. Do not invent an author name or email. A GitHub-provided noreply address is an option if you prefer to keep your account email private.

```powershell
git status
git switch -c learning/win-rate
# Implement one change and run its tests.
git add .
git diff --cached --stat
git diff --cached
git commit -m "Add player win-rate analytics"
git push -u origin learning/win-rate
```

Use a commit message that describes the change you actually made. The example above assumes you implemented the win-rate exercise. Open a pull request if you want to practice reviewing your own work before merging.

## Describe the project honestly

Suggested repository description:

> Personal Python learning lab: browser Snake, FastAPI REST API, SQLite analytics, and automated tests.

Suggested portfolio copy after reading and modifying the project:

> A personal project I use to revisit Python through a browser-based Snake game. I explore FastAPI request validation, SQLite queries, player analytics, and pytest, and document the changes I make as I work through the code.

Avoid claims such as production-grade, thousands of players, or expert Python experience unless supported by actual work. README discloses the AI-assisted initial scaffold. Add a `My changes` section with specific commits or tests as you complete your own improvements.

Relevant topics include `python`, `fastapi`, `sqlite`, `pytest`, `snake-game`, and `learning-project`. Do not link a deployment or CI badge until its real destination and status have been verified. GitHub Actions execution is separate from local test success.
