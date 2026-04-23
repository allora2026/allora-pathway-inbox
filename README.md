# Pathway Inbox

Pathway Inbox is a local-first demo shell for a small Flowcore + Usable event inbox.

The UI shell stays intentionally narrow:

- an inbox feed backed by a persisted runtime-backed Flowcore read model
- an event detail surface showing the canonical event envelope and Flowcore metadata
- a Usable Chat panel grounded in an event-linked note summary

## Run locally

Use the supported one-command path:

```bash
npm start
```

Then open `http://127.0.0.1:3000`.

## Trigger a GitHub push event

The server now supports an explicit trigger route with two honest modes:

- `FLOWCORE_API_KEY` configured: the server posts the payload to Flowcore, persists the returned live Flowcore event id, and keeps that id in the inbox/detail view.
- `FLOWCORE_API_KEY` missing: the server still persists a local runtime event so the demo remains runnable, but the event is marked `local-only` and the UI says live Flowcore ingestion did not happen.

Trigger a GitHub-style push delivery:

```bash
curl -X POST http://127.0.0.1:3000/api/events/trigger/github/push \
  -H 'content-type: application/json' \
  -H 'x-github-delivery: local-delivery-001' \
  --data @- <<'JSON'
{
  "ref": "refs/heads/main",
  "before": "9f8e7d6c5b4a32100112233445566778899aabbc",
  "after": "1a2b3c4d5e6f77889900aabbccddeeff00112233",
  "repository": {
    "id": 90210,
    "name": "allora-pathway-inbox",
    "full_name": "allora-ai/allora-pathway-inbox",
    "html_url": "https://github.com/allora-ai/allora-pathway-inbox"
  },
  "pusher": {
    "name": "playwright-owner"
  },
  "sender": {
    "login": "playwright-owner"
  },
  "head_commit": {
    "id": "1a2b3c4d5e6f77889900aabbccddeeff00112233",
    "message": "Ship runtime-backed inbox ingestion",
    "timestamp": "2026-04-23T09:15:00Z",
    "url": "https://github.com/allora-ai/allora-pathway-inbox/commit/1a2b3c4d5e6f77889900aabbccddeeff00112233"
  },
  "commits": [
    {
      "id": "1a2b3c4d5e6f77889900aabbccddeeff00112233",
      "message": "Ship runtime-backed inbox ingestion",
      "timestamp": "2026-04-23T09:15:00Z",
      "url": "https://github.com/allora-ai/allora-pathway-inbox/commit/1a2b3c4d5e6f77889900aabbccddeeff00112233",
      "author": {
        "name": "playwright-owner"
      }
    }
  ]
}
JSON
```

Replay the persisted event without creating a duplicate inbox ID:

```bash
curl -X POST http://127.0.0.1:3000/api/events/github-push:local-delivery-001/replay
```

The runtime read model is stored at [`data/runtime-store.json`](/Users/allora/projects/allora-pathway-inbox/data/runtime-store.json).

## Flowcore-backed mode

The default Flowcore configuration now targets the provisioned Pathway Inbox resources:

- tenant: `allora2026`
- data core: `pathway-inbox` (`5b700879-58b4-49d0-afd9-43318e781457`)
- flow type: `github-webhook.0`
- event type: `push.received.0`
- virtual pathway: `pathway-inbox-github`

For a live end-to-end trigger, export `FLOWCORE_API_KEY` before starting the server. The app posts to:

```text
https://webhook.api.flowcore.io/event/allora2026/5b700879-58b4-49d0-afd9-43318e781457/github-webhook.0/push.received.0
```

with the raw API key string in the `Authorization` header.

## Verify

Run the automated checks with:

```bash
npm test
```

The projected inbox event keeps the PRD canonical envelope:

- `eventId`
- `source`
- `sourceType`
- `receivedAt`
- `eventType`
- `headline`
- `payload`
- `status`
- `entityKey`

The checked-in demo store currently includes one persisted `local-only` GitHub push event so the app boots without credentials while staying explicit about the fact that no live Flowcore write occurred.
