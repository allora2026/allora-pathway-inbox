# Flowcore Pathway Inbox runbook

## Goal

Wire Pathway Inbox to a Flowcore virtual pathway for GitHub `push` ingress while keeping the repo runnable when live Flowcore and Usable credentials are absent.

## Runtime modules in this repo

- [`src/flowcore/config.js`](../src/flowcore/config.js) defines the Flowcore tenant, pathway, and runtime-store defaults.
- [`src/flowcore/client.js`](../src/flowcore/client.js) builds delivery-safe event IDs, entity keys, and Flowcore metadata.
- [`src/runtime-store.js`](../src/runtime-store.js) persists the read model and handles explicit trigger, replay, and linked-context refresh operations.
- [`src/usable/client.js`](../src/usable/client.js) creates and updates real Usable fragments when credentials are configured.

## Public-repo safety posture

This repo is safe to publish publicly only if it avoids shipping secrets and private live links. The checked-in code now follows that rule:

- no Flowcore API key is committed
- no Usable access token is committed
- no real Usable fragment URLs are seeded in the checked-in runtime store
- the demo store is local-only by default
- live integrations require operator-supplied environment variables

## Local trigger and replay path

1. Start the app with `npm start`.
2. Trigger a GitHub-style push delivery into `POST /api/events/trigger/github/push`.
3. If `FLOWCORE_API_KEY` is configured, confirm the response `eventId` is the real Flowcore event ID returned by the ingest endpoint.
4. If `FLOWCORE_API_KEY` is not configured, confirm the response is explicitly marked `local-only` and does not pretend a live Flowcore write happened.
5. If `USABLE_ACCESS_TOKEN`, `USABLE_WORKSPACE_ID`, and `USABLE_FRAGMENT_TYPE_ID` are configured, confirm the response includes `usable.fragmentId`, `usable.workspaceId`, and `usable.url` on the created or refreshed event context.
6. Confirm the projected event appears in `GET /api/events` and in the browser feed.
7. Replay the same persisted event with `POST /api/events/:eventId/replay`.
8. Confirm the event ID stays stable and the replay count increments in the runtime store.

The runtime read model lives at [`data/runtime-store.json`](../data/runtime-store.json). The server reads that file at runtime instead of using a checked-in JS fixture.

## Live Flowcore route

When `FLOWCORE_API_KEY` is present, the trigger route posts the raw GitHub webhook JSON to:

```text
https://webhook.api.flowcore.io/event/<tenant>/<data-core-id>/<flow-type>/<event-type>
```

using the raw API key value in the `Authorization` header and `content-type: application/json`.

If that POST fails, the server returns an error instead of silently fabricating a live Flowcore result.

## Usable-backed event context

When all three Usable values are present:

- `USABLE_ACCESS_TOKEN`
- `USABLE_WORKSPACE_ID`
- `USABLE_FRAGMENT_TYPE_ID`

Pathway Inbox can:

1. create a fragment on first trigger
2. expose it through `GET /api/events/:eventId/context`
3. update the same fragment through `POST /api/events/:eventId/context/refresh`

The browser panel should then show:

- fragment title
- fragment ID
- last synced timestamp
- grounded fragment content
- an `Open in Usable` link

## Current demo grounding

The repo intentionally checks in only one seeded demo event:

- event id: `github-push:demo-delivery-2026-04-23`
- mode: `local-only`
- replay count: `0`
- linked Usable fragment: none

That seed keeps the app bootable in a fresh clone without claiming any live external write happened.
