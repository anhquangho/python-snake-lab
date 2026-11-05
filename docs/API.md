# API examples and contracts

Base URL: `http://127.0.0.1:8000`. Use `/docs` for interactive examples and `/openapi.json` for the generated contract. All data is local to the selected SQLite file. No authentication or ownership check is implemented.

## Submit a completed run

`POST /api/scores`, `Content-Type: application/json`:

```json
{
  "run_id": "d7a8c018-92d4-4c07-a193-ac3ddbb0a1fd",
  "player_name": "alice",
  "mode": "classic",
  "food_eaten": 4,
  "duration_ms": 12000,
  "outcome": "collision"
}
```

Example response shape (timestamps and IDs are illustrative):

```json
{
  "id": 1,
  "run_id": "d7a8c018-92d4-4c07-a193-ac3ddbb0a1fd",
  "player_name": "alice",
  "mode": "classic",
  "score": 40,
  "food_eaten": 4,
  "duration_ms": 12000,
  "outcome": "collision",
  "completed_at": "2026-11-02T10:00:00Z"
}
```

| Condition | HTTP status | Behavior |
| --- | --- | --- |
| New valid run ID | 201 | Insert once |
| Same run ID, identical normalized data | 200 | Return original row, including timestamp |
| Same run ID, different data | 409 | Keep original row |
| Invalid/missing/extra field | 422 | Return validation details, no insert |
| Operational DB error while submitting | 503 | Client can retry using the original UUID |

`player_name` strips whitespace and lowercases; only 2–20 ASCII letters/numbers/underscore/hyphen. `mode`: `classic` or `sprint`. Food must be an actual JSON integer 0–397; strings, booleans and floats are rejected. Duration is an actual integer 0–86,400,000 ms, representing client-reported active time. `outcome` is `collision` for food 0–396 and `won` for 397. Unknown fields, including `score`, are rejected.

The server derives score and timestamp. It does not validate a replay or prove the food count/duration came from real gameplay.

## Read data

- `GET /api/leaderboard?mode=classic&limit=10`: list of `{rank, player_name, score, duration_ms, completed_at}`. Default limit 10, allowed 1–50. One best run per handle, score descending → active time ascending → insertion ID ascending. Rank is a sequential position.
- `GET /api/players/alice/analytics?mode=classic`: `{player_name, mode, games_played, best_score, average_score, total_food, total_duration_ms, wins, recent_runs}`. Recent runs have the full score response shape, newest first, at most 10. Unknown handle returns 200 with zero aggregates and an empty list.
- `GET /api/stats`: `{games_played, players, best_score}` across both modes. `players` means distinct shared nicknames, not unique people.
- `GET /api/health`: `{"status":"ok"}` after a DB query succeeds.

## Request an AI plan

`POST /api/ai/plan` accepts the selected provider (`openai`, `gemini`, or `anthropic`), a head-first list of `snake` cells, the current `direction`, and the `food` cell. Cells are zero-based `[x, y]` pairs on the 20 × 20 board. Pass the selected provider's key in `Authorization: Bearer <key>`. The server sends one request to that provider.

The response includes `model`, `plan` (for example `R4,U3`), `issue` when there is no usable plan, `latency_ms`, and provider-reported `usage`. Unknown usage fields are null. Upstream errors are reduced to a short message. The browser enforces the per-run call limit and checks plans against the game engine before executing them.

Invalid enum values, nickname formats or bounded query parameters return 422. Unknown routes return 404. JSON serialization is handled through response models. Read endpoints and startup do not provide a production error-handling layer; database failures outside score submission may surface as server errors.
