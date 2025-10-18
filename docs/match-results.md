### Match result confirmation — model, API and frontend flow

This document describes the full lifecycle for match results: draft creation, confirmation, update/delete, rating recalculation, and the client flow on the confirmation page.

— All endpoints are protected by `auth` middleware and require a valid Bearer token.
— Controller: `backend/controllers/resultController.js`
— Routes: `backend/routes/results.js`
— Models: `backend/models/Result.js`, `backend/models/Match.js`
— Rating: `backend/utils/rating.js` (`updateRatingsAfterMatch`)

---

### Data model

`Result`:

```json
{
  "_id": "<resultId>",
  "match": "<matchId>",
  "games": [
    {
      "team1": ["<userId>", "<userId>"],
      "team2": ["<userId>", "<userId>"],
      "team1Score": 21,
      "team2Score": 18
    }
  ],
  "isConfirmed": false,
  "confirmedBy": "<userId?>",
  "confirmedAt": "2025-01-01T10:00:00.000Z?",
  "createdAt": "2025-01-01T09:00:00.000Z"
}
```

`Match` (fragments relevant to results):

```json
{
  "_id": "<matchId>",
  "startDateTime": "2025-01-01T09:00:00.000Z",
  "participants": ["<userId>", "<userId>", "<userId>", "<userId>", ...],
  "status": "upcoming" | "finished" | "cancelled",
  "joinSnapshots": [
    { "userId": "<userId>", "rating": 2.35, "joinedAt": "..." }
  ]
}
```

— Each game stores arrays of participant userIds per team and the score.
— `isConfirmed` indicates final confirmation (further edits are blocked via standard endpoints).
— On confirmation we set `confirmedBy`, `confirmedAt` and switch the match status to `finished`.

---

### Endpoints

Base prefix: `/api/results`

- POST `/` — create a result draft
- GET `/` — list of all results (admin/diagnostics)
- GET `/:matchId` — get the result for a match
- PUT `/:resultId` — update a draft (until confirmation)
- POST `/:resultId/confirm` — confirm result, update ratings, finalize the match
- DELETE `/:resultId` — delete a result (time window and participant restrictions apply)
- GET `/:matchId/stats` — aggregated stats for a match

All requests require `Authorization: Bearer <token>`.

#### Create a result draft

POST `/api/results`

Body:

```json
{
  "matchId": "<matchId>",
  "games": [
    {
      "team1": ["<userId>", "<userId>"],
      "team2": ["<userId>", "<userId>"],
      "team1Score": 21,
      "team2Score": 18
    }
  ]
}
```

Constraints:
- Result for the match must not exist.
- Caller must be a participant of the match.

Success: `201` and the full `Result` object.
Errors (examples):
- `404 { "message": "Match not found" }`
- `400 { "message": "Result already exists for this match" }`
- `403 { "message": "Only participants can confirm the result" }`

Example cURL:

```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "matchId": "<matchId>",
    "games": [{
      "team1": ["<u1>", "<u2>"],
      "team2": ["<u3>", "<u4>"],
      "team1Score": 21,
      "team2Score": 18
    }]
  }' \
  https://<host>/api/results
```

#### Get match result

GET `/api/results/:matchId`

Response:

```json
{
  "_id": "<resultId>",
  "match": { /* populated match */ },
  "games": [ /* ... */ ],
  "isConfirmed": false,
  "confirmedBy": { "_id": "<userId>", "name": "...", "email": "..." } | null
}
```

Errors: `404 { "message": "Result not found" }`.

#### Update result draft

PUT `/api/results/:resultId`

Body:

```json
{ "games": [ { "team1": ["..."], "team2": ["..."], "team1Score": 21, "team2Score": 18 } ] }
```

Constraints:
- Result must not be confirmed (`isConfirmed === false`).
- Caller is a participant of the match.

Success: `200` and the full `Result` with updated `games`.
Errors (examples):
- `404 { "message": "Result not found" }`
- `404 { "message": "Match not found" }`
- `400 { "code": "RESULT_ALREADY_CONFIRMED", "message": "Result already confirmed" }`
- `403 { "message": "Only participants can edit the result" }`

#### Confirm result and update ratings

POST `/api/results/:resultId/confirm`

What happens:
- Ensure confirmer is a participant of the match.
- Time limit: within 24 hours from `match.startDateTime`.
- Aggregate winners by games and collect participants per game.
- Call `updateRatingsAfterMatch` (see Rating section).
- Remove temporary "match without result" entries from `ratingHistory`.
- Set `match.status = "finished"`.
- Mark result as confirmed: `isConfirmed = true`, set `confirmedBy`, `confirmedAt`.

Response (success):

```json
{ "item": { /* Result with confirmed* fields */ } }
```

Errors (examples):
- `404 { "message": "Result not found" }`
- `400 { "code": "RESULT_ALREADY_CONFIRMED", "message": "Result already confirmed" }`
- `404 { "message": "Match not found" }`
- `403 { "message": "Only participants can confirm the result" }`
- `403 { "message": "Result can only be confirmed within 24 hours after match start" }`

#### Delete result

DELETE `/api/results/:resultId`

Constraints:
- Only a participant can delete.
- Time limit: within 24 hours after `startDateTime`.

Effects:
- Result is deleted.
- For all match participants, entries for this match are removed from `User.ratingHistory`.
- `User.rating` reverts to the previous value (`last newRating`) or the base 2.0.

Response: `200 { "message": "Result deleted successfully" }`.

Errors (examples):
- `404 { "message": "Result not found" }`
- `404 { "message": "Match not found" }`
- `403 { "message": "Only participants can delete the result" }`
- `403 { "message": "Result can only be deleted within 24 hours after match start" }`

#### Results list

GET `/api/results`

Response: array of results, sorted by `createdAt` desc.

#### Aggregated match stats

GET `/api/results/:matchId/stats`

Response:

```json
{
  "item": {
    "matchId": "<matchId>",
    "team1Wins": 2,
    "team2Wins": 1,
    "totalGames": 3,
    "participants": [
      {
        "userId": "<userId>",
        "name": "...",
        "email": "...",
        "wins": 2,
        "losses": 1,
        "draws": 0,
        "games": 3,
        "ratingDelta": 0.12,
        "newRating": 2.47,
        "joinRating": 2.35
      }
    ]
  }
}
```

Errors: `404 RESULT_NOT_FOUND`, `404 MATCH_NOT_FOUND` and `500 SERVER_ERROR` (English messages).

---

### Rating: how it is recalculated

The `updateRatingsAfterMatch` function uses a simplified Elo-like model:

- For each game and for each player, compute expected result and delta.
- `K = 0.1` per game. `score = 1/0.5/0` (win/draw/loss).
- Starting point is the player's `joinRating` at match join time. Taken from `User.ratingHistory` (if present) or `Match.joinSnapshots`. Fallback — 2.0.
- Append a history entry per game with total `delta`.
- Update `User.rating` by the sum of deltas.

Key fields of a history entry:

```json
{
  "date": "...",
  "delta": 0.12,
  "newRating": 2.47,
  "matchId": "<matchId>",
  "comment": "Per-game calculation",
  "details": [ /* per-game */ ],
  "joinRating": 2.35
}
```

---

### Client flow (confirmation page)

Component `src/pages/ConfirmResultPage.jsx` implements a step-by-step UX:

1) Load match and existing result (if any).
2) Choose team compositions for a game, enter the score.
3) Draft persistence:
   - POST `/api/results` if there is no draft;
   - PUT `/api/results/:resultId` if draft exists;
   - send a minimal payload: arrays contain only user ids.
4) Confirm result: POST `/api/results/:resultId/confirm`.
5) After success — update local state, reload the match (status/participants), show a "confirmed" read-only screen.

Frontend calls the API through `authFetch` (`utils/api.js`) and handles errors using the standard pattern.

---

### Validation and constraints

- **Only participants** can create/edit/confirm/delete a result.
- **24-hour window** since `match.startDateTime` for confirm/delete.
- **No edits** after confirmation (`RESULT_ALREADY_CONFIRMED`).
- At least **one game** must exist to confirm.
- On confirmation the match switches to `finished`.

---

### Quick examples

Create draft:

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"matchId":"<matchId>","games":[{"team1":["<u1>","<u2>"],"team2":["<u3>","<u4>"],"team1Score":21,"team2Score":18}]}' \
  https://<host>/api/results
```

Update draft:

```bash
curl -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"games":[{"team1":["<u1>","<u2>"],"team2":["<u3>","<u4>"],"team1Score":18,"team2Score":21}]}' \
  https://<host>/api/results/<resultId>
```

Confirm:

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" https://<host>/api/results/<resultId>/confirm
```

Delete:

```bash
curl -X DELETE -H "Authorization: Bearer $TOKEN" https://<host>/api/results/<resultId>
```

Stats:

```bash
curl -H "Authorization: Bearer $TOKEN" https://<host>/api/results/<matchId>/stats
```

---

### Notes on response conventions

- Controller responses return raw `result` objects or `{ item: result }` wrappers for confirmation and stats. Frontend handles both.
- Error messages are in English.


