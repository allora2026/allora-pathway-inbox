import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { canonicalEventKeys } from '../src/data/events.js';
import { triggerGithubPush, replayInboxEvent } from '../src/runtime-store.js';
import { getInboxEventById, loadInboxEvents } from '../src/read-model.js';

function createTempRoot() {
  return mkdtempSync(join(tmpdir(), 'pathway-inbox-read-model-'));
}

function createGithubPushPayload() {
  return {
    ref: 'refs/heads/main',
    before: '9f8e7d6c5b4a32100112233445566778899aabbc',
    after: '1a2b3c4d5e6f77889900aabbccddeeff00112233',
    repository: {
      id: 90210,
      name: 'allora-pathway-inbox',
      full_name: 'allora-ai/allora-pathway-inbox',
      html_url: 'https://github.com/allora-ai/allora-pathway-inbox'
    },
    pusher: {
      name: 'playwright-owner'
    },
    sender: {
      login: 'playwright-owner'
    },
    head_commit: {
      id: '1a2b3c4d5e6f77889900aabbccddeeff00112233',
      message: 'Ship runtime-backed inbox ingestion',
      timestamp: '2026-04-23T09:15:00Z',
      url: 'https://github.com/allora-ai/allora-pathway-inbox/commit/1a2b3c4d5e6f77889900aabbccddeeff00112233'
    },
    commits: [
      {
        id: '1a2b3c4d5e6f77889900aabbccddeeff00112233',
        message: 'Ship runtime-backed inbox ingestion',
        timestamp: '2026-04-23T09:15:00Z',
        url: 'https://github.com/allora-ai/allora-pathway-inbox/commit/1a2b3c4d5e6f77889900aabbccddeeff00112233',
        author: {
          name: 'playwright-owner'
        }
      }
    ]
  };
}

test('loadInboxEvents reads the persisted runtime store after GitHub push ingestion', async () => {
  const root = createTempRoot();

  try {
    const event = await triggerGithubPush({
      deliveryId: 'delivery-001',
      payload: createGithubPushPayload(),
      root,
      receivedAt: '2026-04-23T09:15:00Z',
      env: {}
    });

    const events = loadInboxEvents({ root });

    assert.equal(events.length, 1);
    assert.equal(events[0].eventId, event.eventId);
    assert.equal(events[0].eventId, 'github-push:delivery-001');

    for (const key of canonicalEventKeys) {
      assert.ok(events[0][key], `missing canonical key ${key}`);
    }

    assert.equal(events[0].flowcore.flowType, 'github-webhook.0');
    assert.equal(events[0].flowcore.eventType, 'push.received.0');
    assert.equal(events[0].notes[0].title, 'GitHub push note');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('triggerGithubPush and replayInboxEvent keep delivery-based ids replay-safe', async () => {
  const root = createTempRoot();

  try {
    const payload = createGithubPushPayload();
    const triggered = await triggerGithubPush({
      deliveryId: 'delivery-002',
      payload,
      root,
      receivedAt: '2026-04-23T09:15:00Z',
      env: {}
    });

    const duplicateTrigger = await triggerGithubPush({
      deliveryId: 'delivery-002',
      payload,
      root,
      receivedAt: '2026-04-23T09:16:00Z',
      env: {}
    });
    const replayed = replayInboxEvent({
      eventId: triggered.eventId,
      root,
      replayedAt: '2026-04-23T09:17:00Z'
    });

    const events = loadInboxEvents({ root });

    assert.equal(triggered.eventId, 'github-push:delivery-002');
    assert.equal(duplicateTrigger.eventId, triggered.eventId);
    assert.equal(replayed.eventId, triggered.eventId);
    assert.equal(events.length, 1);
    assert.equal(events[0].runtime.replayCount, 1);
    assert.match(events[0].replayState, /Replayed 1 time/);
    assert.equal(events[0].timeline.at(-1).label, 'Replay requested for the persisted inbox event');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('getInboxEventById returns runtime-backed events and null for unknown ids', async () => {
  const root = createTempRoot();

  try {
    const event = await triggerGithubPush({
      deliveryId: 'delivery-003',
      payload: createGithubPushPayload(),
      root,
      receivedAt: '2026-04-23T09:15:00Z',
      env: {}
    });

    assert.equal(getInboxEventById(event.eventId, { root })?.eventId, event.eventId);
    assert.equal(getInboxEventById('missing-event', { root }), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('triggerGithubPush persists the live Flowcore event id and ingest metadata when FLOWCORE_API_KEY is configured', async () => {
  const root = createTempRoot();
  const payload = createGithubPushPayload();
  const calls = [];

  try {
    const event = await triggerGithubPush({
      deliveryId: 'delivery-live-001',
      payload,
      root,
      receivedAt: '2026-04-23T09:15:00Z',
      env: {
        FLOWCORE_API_KEY: 'raw-live-key',
        FLOWCORE_DATA_CORE_ID: '5b700879-58b4-49d0-afd9-43318e781457',
        FLOWCORE_DATA_CORE_NAME: 'pathway-inbox'
      },
      fetchImpl: async (url, init) => {
        calls.push({ url, init });

        return new Response(
          JSON.stringify({
            eventId: '460565df-live-event-001',
            timeBucket: '20260423091500'
          }),
          {
            status: 201,
            headers: {
              'content-type': 'application/json'
            }
          }
        );
      }
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://webhook.api.flowcore.io/event/allora2026/5b700879-58b4-49d0-afd9-43318e781457/github-webhook.0/push.received.0');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers.authorization, 'raw-live-key');
    assert.equal(calls[0].init.headers['content-type'], 'application/json');
    assert.equal(event.eventId, '460565df-live-event-001');
    assert.equal(event.status, 'received');
    assert.equal(event.flowcore.liveEventId, '460565df-live-event-001');
    assert.equal(event.flowcore.ingestionMode, 'live');
    assert.equal(event.flowcore.timeBucket, '20260423091500');
    assert.equal(event.flowcore.sourceEventId, 'github-push:delivery-live-001');
    assert.equal(event.runtime.triggerMode, 'live-flowcore');

    const persisted = getInboxEventById(event.eventId, { root });

    assert.equal(persisted?.eventId, '460565df-live-event-001');
    assert.equal(persisted?.flowcore.liveEventId, '460565df-live-event-001');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('triggerGithubPush stays runnable locally and marks the event as local-only when live Flowcore ingestion is unavailable', async () => {
  const root = createTempRoot();

  try {
    const event = await triggerGithubPush({
      deliveryId: 'delivery-local-001',
      payload: createGithubPushPayload(),
      root,
      receivedAt: '2026-04-23T09:15:00Z',
      env: {}
    });

    assert.equal(event.eventId, 'github-push:delivery-local-001');
    assert.equal(event.status, 'local-only');
    assert.equal(event.flowcore.liveEventId, null);
    assert.equal(event.flowcore.ingestionMode, 'local-only');
    assert.equal(event.runtime.triggerMode, 'local-only');
    assert.match(event.summary, /FLOWCORE_API_KEY/i);
    assert.match(event.replayState, /Local-only runtime event/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
