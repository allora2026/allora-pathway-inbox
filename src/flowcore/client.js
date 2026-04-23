import { getFlowcoreConfig } from './config.js';

function pad(value) {
  return String(value).padStart(2, '0');
}

export function createGithubPushEventId(deliveryId) {
  return `github-push:${deliveryId}`;
}

export function createGithubPushEntityKey(payload) {
  return `github-push:${payload.repository.id}:${payload.ref}`;
}

export function createTimeBucket(timestamp) {
  const date = new Date(timestamp);

  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    '00'
  ].join('');
}

export function getFlowcoreRoute(config = getFlowcoreConfig()) {
  return `flowcore://${config.dataCoreName}/${config.flowType}/${config.eventType}`;
}

export function getFlowcoreIngestionEndpoint(config = getFlowcoreConfig()) {
  return `${config.ingestionBaseUrl}/event/${config.tenant}/${config.dataCoreId}/${config.flowType}/${config.eventType}`;
}

export function getFlowcoreIngestionMode(config = getFlowcoreConfig()) {
  return config.apiKey ? 'live' : 'local-only';
}

export function createFlowcoreContext({ deliveryId, payload, receivedAt, config = getFlowcoreConfig() }) {
  return {
    tenant: config.tenant,
    dataCoreId: config.dataCoreId,
    flowType: config.flowType,
    eventType: config.eventType,
    timeBucket: createTimeBucket(receivedAt),
    pathwayName: config.pathwayName,
    route: getFlowcoreRoute(config),
    ingestionEndpoint: getFlowcoreIngestionEndpoint(config),
    ingestionMode: getFlowcoreIngestionMode(config),
    sourceEventId: createGithubPushEventId(deliveryId),
    entityKey: createGithubPushEntityKey(payload)
  };
}

export async function ingestFlowcoreEvent({
  payload,
  fetchImpl = globalThis.fetch,
  config = getFlowcoreConfig()
}) {
  if (!config.apiKey) {
    return {
      ingestionMode: 'local-only',
      liveEventId: null,
      responseStatus: null,
      responseBody: null
    };
  }

  if (typeof fetchImpl !== 'function') {
    throw new Error('Live Flowcore ingestion requires fetch support');
  }

  const response = await fetchImpl(getFlowcoreIngestionEndpoint(config), {
    method: 'POST',
    headers: {
      authorization: config.apiKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
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
      `Flowcore ingestion failed with status ${response.status}`;
    const error = new Error(message);
    error.statusCode = 502;
    throw error;
  }

  const liveEventId =
    parsedBody?.eventId ??
    parsedBody?.id ??
    parsedBody?.event?.eventId ??
    parsedBody?.event?.id ??
    null;

  if (!liveEventId) {
    const error = new Error('Flowcore ingestion response did not include an event id');
    error.statusCode = 502;
    throw error;
  }

  return {
    ingestionMode: 'live',
    liveEventId,
    timeBucket: parsedBody?.timeBucket ?? null,
    responseStatus: response.status,
    responseBody: parsedBody
  };
}
