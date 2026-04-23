# Pathway Inbox

Pathway Inbox is a local-first demo shell for a small Flowcore + Usable event inbox.

The UI stays intentionally narrow:

- an inbox feed backed by a persisted runtime-backed read model
- an event detail surface showing the canonical event envelope and Flowcore metadata
- a Usable context panel grounded in an event-linked note summary

## Requirements

- Node.js 20+ (for the built-in `fetch` used by the server)

## Quick start

```bash
npm start
```

Then open `http://127.0.0.1:3000`.

The checked-in demo store is intentionally safe for a public repo: it contains one seeded `local-only` GitHub push event and no live API keys, bearer tokens, or real Usable fragment links.

## Reproducible setup

### 1) Local-only mode

No credentials required.

```bash
npm start
```

In this mode, the app remains runnable and honest:

- `POST /api/events/trigger/github/push` persists a runtime event locally
- the event is marked `local-only`
- the UI explicitly says live Flowcore ingestion did not happen
- the Usable panel stays in fallback mode unless you configure Usable credentials

### 2) Flowcore-backed mode

For live Flowcore ingestion, export your own Flowcore credentials before starting the server:

```bash
export FLOWCORE_API_KEY='YOUR_FLOWCORE_API_KEY'
export FLOWCORE_TENANT='YOUR_TENANT'
export FLOWCORE_DATA_CORE_ID='YOUR_DATA_CORE_ID'
export FLOWCORE_DATA_CORE_NAME='YOUR_DATA_CORE_NAME'
# optional overrides
export FLOWCORE_FLOW_TYPE='github-webhook.0'
export FLOWCORE_EVENT_TYPE='push.received.0'
export FLOWCORE_PATHWAY_NAME='pathway-inbox-github'
```

If you do not override them, the app defaults to the current Pathway Inbox demo routing values already encoded in the repo:

- tenant: `allora2026`
- data core: `pathway-inbox` (`5b700879-58b4-49d0-afd9-43318e781457`)
- flow type: `github-webhook.0`
- event type: `push.received.0`
- virtual pathway: `pathway-inbox-github`

The app posts raw GitHub webhook JSON to:

```text
https://webhook.api.flowcore.io/event/<tenant>/<data-core-id>/<flow-type>/<event-type>
```

using the raw API key string in the `Authorization` header.

### 3) Usable-backed mode

To create or refresh a real Usable fragment, export your own Usable settings:

```bash
export USABLE_ACCESS_TOKEN='YOUR_USABLE_ACCESS_TOKEN'
export USABLE_WORKSPACE_ID='YOUR_WORKSPACE_ID'
export USABLE_FRAGMENT_TYPE_ID='YOUR_FRAGMENT_TYPE_ID'
# optional override
export USABLE_API_BASE_URL='https://usable.dev/api'
export USABLE_APP_BASE_URL='https://usable.dev'
```

When configured, the same trigger and refresh routes create or update a real Usable fragment through:

```text
https://usable.dev/api/memory-fragments
```

The browser then exposes a `Usable event context` panel with:

- the linked fragment title and fragment ID
- a `Refresh linked memory` button backed by `POST /api/events/:eventId/context/refresh`
- an `Open in Usable` link that jumps to the linked fragment

## Trigger a GitHub push event

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

The runtime read model is stored at [`data/runtime-store.json`](data/runtime-store.json).

## Verify

Run the automated checks with:

```bash
npm test
```

Manual verification paths:

1. Open `http://127.0.0.1:3000/#<eventId>` for a persisted event.
2. Confirm the detail panel shows the canonical envelope and Flowcore metadata.
3. In local-only mode, confirm the UI explicitly says live Flowcore ingestion did not occur.
4. In Usable-backed mode, confirm the `Usable event context` panel renders linked fragment content.
5. Click `Refresh linked memory` and confirm the fragment stays attached to the same event.

## Canonical projected event keys

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
