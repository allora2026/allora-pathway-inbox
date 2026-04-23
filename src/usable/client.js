const DEFAULT_USABLE_API_BASE_URL = 'https://usable.dev/api';
const DEFAULT_USABLE_APP_BASE_URL = 'https://usable.dev';
const DEFAULT_USABLE_WORKSPACE_ID = null;
const DEFAULT_USABLE_FRAGMENT_TYPE_ID = null;

function createHeaders(accessToken) {
  return {
    authorization: `Bearer ${accessToken}`,
    'content-type': 'application/json'
  };
}

function getRepositoryName(event) {
  return event.payload?.repository?.full_name ?? 'unknown repository';
}

function getCommitMessage(event) {
  return event.payload?.head_commit?.message ?? 'No commit message available.';
}

function getCommitCount(event) {
  return event.payload?.commits?.length ?? 0;
}

function getFlowcoreEventId(event) {
  return event.flowcore?.liveEventId ?? event.eventId;
}

export function getUsableConfig(env = process.env) {
  return {
    accessToken: env.USABLE_ACCESS_TOKEN ?? null,
    apiBaseUrl: env.USABLE_API_BASE_URL ?? DEFAULT_USABLE_API_BASE_URL,
    appBaseUrl: env.USABLE_APP_BASE_URL ?? DEFAULT_USABLE_APP_BASE_URL,
    workspaceId: env.USABLE_WORKSPACE_ID ?? DEFAULT_USABLE_WORKSPACE_ID,
    fragmentTypeId: env.USABLE_FRAGMENT_TYPE_ID ?? DEFAULT_USABLE_FRAGMENT_TYPE_ID
  };
}

export function hasUsableAccess(config = getUsableConfig()) {
  return Boolean(config.accessToken && config.workspaceId && config.fragmentTypeId);
}

export function buildUsableFragmentUrl(
  fragmentId,
  config = getUsableConfig()
) {
  return `${config.appBaseUrl}/dashboard/workspaces/${config.workspaceId}/fragments/${fragmentId}`;
}

export function buildUsableTags(event) {
  return [
    'pathway-inbox',
    'flowcore',
    'usable',
    'event-note',
    'project:pathway-inbox',
    'repo:allora-pathway-inbox',
    `source:${event.source}`,
    `event-type:${event.eventType}`
  ];
}

export function buildUsableFragmentTitle(event) {
  return `Pathway Inbox event context — ${getRepositoryName(event)}`;
}

export function buildUsableFragmentContent(event) {
  return [
    '# Pathway Inbox event context',
    '',
    `Headline: ${event.headline}`,
    `Flowcore event ID: ${getFlowcoreEventId(event)}`,
    `Source event ID: ${event.flowcore?.sourceEventId ?? event.eventId}`,
    `Repository: ${getRepositoryName(event)}`,
    `Ref: ${event.payload?.ref ?? 'unknown ref'}`,
    `Replay count: ${event.runtime?.replayCount ?? 0}`,
    `Commit count: ${getCommitCount(event)}`,
    `Commit message: ${getCommitMessage(event)}`,
    '',
    '## Operator summary',
    event.summary,
    '',
    '## Replay path',
    event.runtime?.replayPath ?? 'Replay path unavailable.'
  ].join('\n');
}

async function requestUsable(pathname, { method, body, fetchImpl = globalThis.fetch, config }) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('Usable API calls require fetch support');
  }

  const response = await fetchImpl(`${config.apiBaseUrl}${pathname}`, {
    method,
    headers: createHeaders(config.accessToken),
    body: body ? JSON.stringify(body) : undefined
  });
  const rawBody = await response.text();
  let parsedBody = null;

  if (rawBody) {
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      parsedBody = { rawBody };
    }
  }

  if (!response.ok) {
    const message =
      parsedBody?.error ??
      parsedBody?.message ??
      `Usable request failed with status ${response.status}`;
    const error = new Error(message);
    error.statusCode = 502;
    throw error;
  }

  return parsedBody;
}

function createPersistedContext({
  fragmentId,
  title,
  content,
  syncedAt,
  config
}) {
  return {
    fragmentId,
    workspaceId: config.workspaceId,
    url: buildUsableFragmentUrl(fragmentId, config),
    title,
    content,
    lastSyncedAt: syncedAt
  };
}

export async function createUsableFragmentForEvent({
  event,
  fetchImpl,
  config = getUsableConfig()
}) {
  const syncedAt = new Date().toISOString();
  const title = buildUsableFragmentTitle(event);
  const content = buildUsableFragmentContent(event);
  const payload = {
    title,
    content,
    workspaceId: config.workspaceId,
    fragmentTypeId: config.fragmentTypeId,
    tags: buildUsableTags(event)
  };
  const response = await requestUsable('/memory-fragments', {
    method: 'POST',
    body: payload,
    fetchImpl,
    config
  });
  const fragmentId =
    response?.fragmentId ??
    response?.id ??
    response?.fragment?.fragmentId ??
    response?.fragment?.id ??
    null;

  if (!fragmentId) {
    const error = new Error('Usable create fragment response did not include a fragment id');
    error.statusCode = 502;
    throw error;
  }

  return createPersistedContext({
    fragmentId,
    title: response?.title ?? title,
    content,
    syncedAt,
    config
  });
}

export async function updateUsableFragmentForEvent({
  event,
  fragmentId,
  fetchImpl,
  config = getUsableConfig()
}) {
  const syncedAt = new Date().toISOString();
  const title = buildUsableFragmentTitle(event);
  const content = buildUsableFragmentContent(event);

  await requestUsable(`/memory-fragments/${fragmentId}`, {
    method: 'PATCH',
    body: {
      content,
      tags: buildUsableTags(event)
    },
    fetchImpl,
    config
  });

  return createPersistedContext({
    fragmentId,
    title,
    content,
    syncedAt,
    config
  });
}
