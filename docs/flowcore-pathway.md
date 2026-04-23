# Flowcore Pathway Inbox runbook

## Goal

Wire Pathway Inbox to a Flowcore virtual pathway for GitHub `push` ingress while keeping the repo runnable when live Flowcore credentials are absent.

## Runtime modules in this repo

- [`src/flowcore/config.js`](/Users/allora/projects/allora-pathway-inbox/src/flowcore/config.js) defines the Flowcore tenant, pathway, and runtime store path defaults.
- [`src/flowcore/client.js`](/Users/allora/projects/allora-pathway-inbox/src/flowcore/client.js) builds delivery-safe event IDs, entity keys, and Flowcore metadata.
- [`src/runtime-store.js`](/Users/allora/projects/allora-pathway-inbox/src/runtime-store.js) persists the read model and handles explicit trigger/replay operations.

## Local trigger and replay path

1. Start the app with `npm start`.
2. Trigger a GitHub-style push delivery into `POST /api/events/trigger/github/push`.
3. If `FLOWCORE_API_KEY` is configured, confirm the response `eventId` is the real Flowcore event id returned by the ingest endpoint.
4. If `FLOWCORE_API_KEY` is not configured, confirm the response is explicitly marked `local-only` and does not pretend a live Flowcore write happened.
5. Confirm the projected event appears in `GET /api/events` and in the browser feed.
6. Replay the same persisted event with `POST /api/events/:eventId/replay`.
7. Confirm the event ID stays stable and the replay count increments in the runtime store.

The runtime read model lives at [`data/runtime-store.json`](/Users/allora/projects/allora-pathway-inbox/data/runtime-store.json). The server reads that file at runtime instead of using the old checked-in source fixture.

## Live Flowcore route

When `FLOWCORE_API_KEY` is present, the trigger route posts the raw GitHub webhook JSON to:

```text
https://webhook.api.flowcore.io/event/allora2026/5b700879-58b4-49d0-afd9-43318e781457/github-webhook.0/push.received.0
```

using the raw API key value in the `Authorization` header and `content-type: application/json`.

If that POST fails, the server returns an error instead of silently fabricating a live Flowcore result.

## Current demo grounding

- Tenant: `allora2026`
- Data core: `pathway-inbox` (`5b700879-58b4-49d0-afd9-43318e781457`)
- Flow type: `github-webhook.0`
- Event type: `push.received.0`
- Virtual pathway: `pathway-inbox-github` (`223d30af-1610-4eb9-8d2b-a738df806df6`)
- Seed runtime event id: `github-push:demo-delivery-2026-04-23`

## Operator steps

### Local-only mode

1. Start the app without `FLOWCORE_API_KEY`.
2. POST the sample payload to `http://127.0.0.1:3000/api/events/trigger/github/push`.
3. Confirm the returned event has:
   - `status: "local-only"`
   - `flowcore.ingestionMode: "local-only"`
   - `flowcore.liveEventId: null`
4. Open the app and confirm the detail panel says live Flowcore ingestion is unavailable.

### Live Flowcore mode

1. Export `FLOWCORE_API_KEY` and optionally the other `FLOWCORE_*` overrides before `npm start`.
2. POST the sample payload to `http://127.0.0.1:3000/api/events/trigger/github/push`.
3. Confirm the returned event has:
   - a real Flowcore `eventId`
   - `status: "received"`
   - `flowcore.ingestionMode: "live"`
   - `flowcore.liveEventId` equal to `eventId`
4. Confirm `GET /api/events` returns the same live event id from the runtime store.
5. Open the app and verify the feed/detail view shows the same live Flowcore event id.
