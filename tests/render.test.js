import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { canonicalEventKeys } from '../src/data/events.js';
import { triggerGithubPush } from '../src/runtime-store.js';
import { loadInboxEvents } from '../src/read-model.js';
import { renderApp } from '../src/render.js';

function createTempRoot() {
  return mkdtempSync(join(tmpdir(), 'pathway-inbox-render-'));
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

test('renderApp includes the existing shell surfaces for runtime-backed events', async () => {
  const root = createTempRoot();

  try {
    const event = await triggerGithubPush({
      deliveryId: 'delivery-101',
      payload: createGithubPushPayload(),
      root,
      receivedAt: '2026-04-23T09:15:00Z',
      env: {}
    });
    const events = loadInboxEvents({ root });
    const html = renderApp(events, event.eventId, {
      context: {
        title: 'Pathway Inbox event context',
        fragmentId: 'usable-fragment-101',
        content: 'Real linked fragment content for the selected event.',
        lastSyncedAt: '2026-04-23T09:15:00Z'
      }
    });

    assert.match(html, /Pathway Inbox/);
    assert.match(html, /Recent events/);
    assert.match(html, /Event detail view/);
    assert.match(html, /Usable event context/);
    assert.match(html, /Flowcore and Usable story/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('renderApp describes the persisted runtime event and renders the linked Usable fragment content with an action button', async () => {
  const root = createTempRoot();

  try {
    const event = await triggerGithubPush({
      deliveryId: 'delivery-102',
      payload: createGithubPushPayload(),
      root,
      receivedAt: '2026-04-23T09:15:00Z',
      env: {}
    });
    const events = loadInboxEvents({ root });
    const html = renderApp(events, event.eventId, {
      context: {
        title: 'Pathway Inbox event context',
        fragmentId: 'usable-fragment-102',
        content: [
          '# Pathway Inbox event context',
          '',
          'Flowcore event ID: github-push:delivery-102',
          'Replay count: 0',
          'Commit message: Ship runtime-backed inbox ingestion'
        ].join('\n'),
        url: 'https://usable.dev/dashboard/workspaces/aee4606a-0522-484f-8139-548d528461ef/fragments/usable-fragment-102',
        lastSyncedAt: '2026-04-23T09:15:00Z'
      }
    });

    assert.match(html, /github-push:delivery-102/);
    assert.match(html, /allora-ai\/allora-pathway-inbox received push to refs\/heads\/main/);
    assert.match(html, /local-only persisted runtime event/i);
    assert.match(html, /FLOWCORE_API_KEY/);
    assert.match(html, /POST \/api\/events\/trigger\/github\/push/);
    assert.match(html, /POST \/api\/events\/github-push:delivery-102\/replay/);
    assert.match(html, /Pathway Inbox event context/);
    assert.match(html, /usable-fragment-102/);
    assert.match(html, /Refresh linked memory/);
    assert.match(html, /Open in Usable/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('projected runtime events still satisfy the canonical envelope while the panel can render a loading or fallback state', async () => {
  const root = createTempRoot();

  try {
    await triggerGithubPush({
      deliveryId: 'delivery-103',
      payload: createGithubPushPayload(),
      root,
      receivedAt: '2026-04-23T09:15:00Z',
      env: {}
    });

    const events = loadInboxEvents({ root });

    assert.equal(events.length, 1);

    for (const event of events) {
      for (const key of canonicalEventKeys) {
        assert.ok(event[key], `missing ${key} on ${event.eventId}`);
      }

      assert.ok(Array.isArray(event.timeline));
      assert.ok(Array.isArray(event.notes));
      assert.ok(Array.isArray(event.prompts));
    }

    assert.equal(events[0].entityKey, 'github-push:90210:refs/heads/main');
    assert.match(
      renderApp(events, events[0].eventId, {
        contextLoading: true
      }),
      /Loading linked context/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
