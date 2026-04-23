import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { getServerConfig, getListenHosts, routeRequest } from '../server.js';

function createTempRoot() {
  return mkdtempSync(join(tmpdir(), 'pathway-inbox-server-'));
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

test('routeRequest triggers GitHub push ingestion into the persisted runtime store', async () => {
  const root = createTempRoot();

  try {
    const response = await routeRequest({
      method: 'POST',
      pathname: '/api/events/trigger/github/push',
      headers: {
        'x-github-delivery': 'delivery-201'
      },
      body: JSON.stringify(createGithubPushPayload()),
      root,
      env: {}
    });

    assert.equal(response.status, 202);
    assert.equal(response.headers['content-type'], 'application/json; charset=utf-8');

    const event = JSON.parse(response.body);

    assert.equal(event.eventId, 'github-push:delivery-201');
    assert.equal(event.runtime.triggerPath, '/api/events/trigger/github/push');
    assert.equal(event.status, 'local-only');

    const eventsResponse = await routeRequest({
      method: 'GET',
      pathname: '/api/events',
      root,
      env: {}
    });
    const events = JSON.parse(eventsResponse.body);

    assert.equal(events.length, 1);
    assert.equal(events[0].eventId, event.eventId);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('routeRequest replays existing runtime events without creating duplicate ids', async () => {
  const root = createTempRoot();

  try {
    const created = JSON.parse(
      (
        await routeRequest({
          method: 'POST',
          pathname: '/api/events/trigger/github/push',
          headers: {
            'x-github-delivery': 'delivery-202'
          },
          body: JSON.stringify(createGithubPushPayload()),
          root,
          env: {}
        })
      ).body
    );

    const replayed = await routeRequest({
      method: 'POST',
      pathname: `/api/events/${created.eventId}/replay`,
      root,
      env: {}
    });
    const missing = await routeRequest({
      method: 'POST',
      pathname: '/api/events/missing-event/replay',
      root,
      env: {}
    });

    assert.equal(replayed.status, 202);
    assert.equal(JSON.parse(replayed.body).eventId, created.eventId);
    assert.equal(JSON.parse(replayed.body).runtime.replayCount, 1);
    assert.equal(missing.status, 404);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('routeRequest resolves individual events from the runtime-backed store', async () => {
  const root = createTempRoot();

  try {
    const created = JSON.parse(
      (
        await routeRequest({
          method: 'POST',
          pathname: '/api/events/trigger/github/push',
          headers: {
            'x-github-delivery': 'delivery-203'
          },
          body: JSON.stringify(createGithubPushPayload()),
          root,
          env: {}
        })
      ).body
    );

    const found = await routeRequest({
      method: 'GET',
      pathname: `/api/events/${created.eventId}`,
      root,
      env: {}
    });
    const missing = await routeRequest({
      method: 'GET',
      pathname: '/api/events/missing-event',
      root,
      env: {}
    });

    assert.equal(found.status, 200);
    assert.equal(JSON.parse(found.body).eventId, created.eventId);
    assert.equal(missing.status, 404);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('getServerConfig defaults to localhost and can include a Tailscale IP', () => {
  assert.deepEqual(getServerConfig({}), {
    port: 3000,
    tailscaleIp: null
  });

  assert.deepEqual(getServerConfig({ TAILSCALE_IP: '100.103.144.45', PORT: '4010' }), {
    port: 4010,
    tailscaleIp: '100.103.144.45'
  });
});

test('getListenHosts returns localhost plus unique Tailscale listener when configured', () => {
  assert.deepEqual(getListenHosts(getServerConfig({})), ['127.0.0.1']);

  assert.deepEqual(
    getListenHosts(getServerConfig({ TAILSCALE_IP: '100.103.144.45' })),
    ['127.0.0.1', '100.103.144.45']
  );

  assert.deepEqual(
    getListenHosts(getServerConfig({ TAILSCALE_IP: '127.0.0.1' })),
    ['127.0.0.1']
  );
});

test('routeRequest uses live Flowcore ingestion when FLOWCORE_API_KEY is configured', async () => {
  const root = createTempRoot();

  try {
    const response = await routeRequest({
      method: 'POST',
      pathname: '/api/events/trigger/github/push',
      headers: {
        'x-github-delivery': 'delivery-live-201'
      },
      body: JSON.stringify(createGithubPushPayload()),
      root,
      env: {
        FLOWCORE_API_KEY: 'raw-live-key',
        FLOWCORE_DATA_CORE_ID: '5b700879-58b4-49d0-afd9-43318e781457',
        FLOWCORE_DATA_CORE_NAME: 'pathway-inbox'
      },
      fetchImpl: async () =>
        new Response(JSON.stringify({ eventId: 'flowcore-live-server-201' }), {
          status: 201,
          headers: {
            'content-type': 'application/json'
          }
        })
    });

    const event = JSON.parse(response.body);

    assert.equal(response.status, 202);
    assert.equal(event.eventId, 'flowcore-live-server-201');
    assert.equal(event.flowcore.liveEventId, 'flowcore-live-server-201');
    assert.equal(event.runtime.triggerMode, 'live-flowcore');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
