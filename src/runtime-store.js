import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { getFlowcoreConfig, getRuntimeStorePath } from './flowcore/config.js';
import {
  createFlowcoreContext,
  createGithubPushEventId,
  ingestFlowcoreEvent
} from './flowcore/client.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createEmptyRuntimeState(config) {
  return {
    version: 1,
    generatedAt: null,
    flowcore: {
      tenant: config.tenant,
      dataCoreId: config.dataCoreId,
      dataCoreName: config.dataCoreName,
      flowType: config.flowType,
      eventType: config.eventType,
      pathwayName: config.pathwayName,
      ingestionBaseUrl: config.ingestionBaseUrl
    },
    events: []
  };
}

function ensureRuntimeStoreFile(options = {}) {
  const path = getRuntimeStorePath(options);

  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(createEmptyRuntimeState(getFlowcoreConfig(options.env)), null, 2)}\n`);
  }

  return path;
}

function readRuntimeState(options = {}) {
  const path = ensureRuntimeStoreFile(options);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeRuntimeState(state, options = {}) {
  const path = ensureRuntimeStoreFile(options);
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
}

function createCommitSummary(payload) {
  const commitCount = payload.commits.length;
  const commitLabel = commitCount === 1 ? 'commit' : 'commits';
  return `${commitCount} ${commitLabel} pushed to ${payload.ref} in ${payload.repository.full_name}`;
}

function createReplayState({ replayCount, replayPath, ingestionMode }) {
  const replayLabel = replayCount === 1 ? 'time' : 'times';

  if (ingestionMode === 'live') {
    return `Ready for replay from POST ${replayPath}. Replayed ${replayCount} ${replayLabel}.`;
  }

  return `Local-only runtime event. Replay stays inside Pathway Inbox until FLOWCORE_API_KEY is configured. Replayed ${replayCount} ${replayLabel}.`;
}

function createNoteBody({ deliveryId, payload }) {
  return `Delivery ${deliveryId} pushed ${payload.after.slice(0, 7)} to ${payload.ref} with ${payload.commits.length} recorded commit entries.`;
}

function findEventIndex(state, deliveryId) {
  return state.events.findIndex(
    (event) =>
      event.runtime?.deliveryId === deliveryId ||
      event.flowcore?.sourceEventId === createGithubPushEventId(deliveryId)
  );
}

function createEventSummary({ payload, ingestionMode }) {
  const baseSummary = `${createCommitSummary(payload)} by ${payload.sender.login}.`;

  if (ingestionMode === 'live') {
    return baseSummary;
  }

  return `${baseSummary} Live Flowcore ingest is unavailable in this runtime; set FLOWCORE_API_KEY to send the event to Flowcore.`;
}

function createEventTimeline({ deliveryId, payload, receivedAt, ingestionMode, persistedEventId }) {
  const delivered = {
    label: `GitHub delivered push ${deliveryId} to the runtime trigger endpoint`,
    at: receivedAt
  };

  if (ingestionMode === 'live') {
    return [
      delivered,
      {
        label: `Flowcore accepted live event ${persistedEventId} for ${payload.repository.full_name}`,
        at: receivedAt
      },
      {
        label: `Pathway Inbox persisted the landed Flowcore read model for ${payload.repository.full_name}`,
        at: receivedAt
      }
    ];
  }

  return [
    delivered,
    {
      label: `Pathway Inbox stored a local-only runtime event because FLOWCORE_API_KEY is not configured`,
      at: receivedAt
    }
  ];
}

function projectGithubPushEvent({
  deliveryId,
  payload,
  receivedAt,
  persistedEventId,
  liveIngestion,
  config = getFlowcoreConfig()
}) {
  const flowcore = createFlowcoreContext({ deliveryId, payload, receivedAt, config });
  const eventId = persistedEventId ?? flowcore.sourceEventId;
  const triggerPath = '/api/events/trigger/github/push';
  const replayPath = `/api/events/${eventId}/replay`;

  return {
    eventId,
    source: 'github',
    sourceType: 'webhook',
    receivedAt,
    eventType: flowcore.eventType,
    headline: `${payload.repository.full_name} received push to ${payload.ref}`,
    payload,
    status: liveIngestion.ingestionMode === 'live' ? 'received' : 'local-only',
    entityKey: flowcore.entityKey,
    route: flowcore.route,
    summary: createEventSummary({ payload, ingestionMode: liveIngestion.ingestionMode }),
    replayState: createReplayState({
      replayCount: 0,
      replayPath,
      ingestionMode: liveIngestion.ingestionMode
    }),
    timeline: createEventTimeline({
      deliveryId,
      payload,
      receivedAt,
      ingestionMode: liveIngestion.ingestionMode,
      persistedEventId: eventId
    }),
    notes: [
      {
        author: 'Usable memory',
        savedAt: receivedAt,
        title: 'GitHub push note',
        body: createNoteBody({ deliveryId, payload }),
        fragmentId: `runtime-note:${deliveryId}`,
        workspaceId: 'runtime-local'
      }
    ],
    prompts: [
      'Summarize the landed push for an operator.',
      'Which replay endpoint should I call to rebuild this inbox event?'
    ],
    chat: [
      {
        speaker: 'Operator',
        message: 'Which GitHub push is grounding this inbox item?'
      },
      {
        speaker: 'Usable Chat',
        message: `Delivery ${deliveryId} pushed ${payload.commits.length} commit entries to ${payload.ref} for ${payload.repository.full_name}.`
      }
    ],
    flowcore: {
      tenant: flowcore.tenant,
      dataCoreId: flowcore.dataCoreId,
      flowType: flowcore.flowType,
      eventType: flowcore.eventType,
      timeBucket: liveIngestion.timeBucket ?? flowcore.timeBucket,
      pathwayName: flowcore.pathwayName,
      ingestionEndpoint: flowcore.ingestionEndpoint,
      sourceEventId: flowcore.sourceEventId,
      liveEventId: liveIngestion.liveEventId,
      ingestionMode: liveIngestion.ingestionMode,
      lastResponseStatus: liveIngestion.responseStatus
    },
    runtime: {
      deliveryId,
      replayCount: 0,
      triggerPath,
      replayPath,
      triggerMode: liveIngestion.ingestionMode === 'live' ? 'live-flowcore' : 'local-only',
      lastTriggeredAt: receivedAt,
      lastReplayedAt: null
    }
  };
}

function sortEvents(events) {
  return [...events].sort((left, right) => right.receivedAt.localeCompare(left.receivedAt));
}

export function loadRuntimeEvents(options = {}) {
  return sortEvents(readRuntimeState(options).events);
}

export function getRuntimeEventById(eventId, options = {}) {
  return loadRuntimeEvents(options).find((event) => event.eventId === eventId) ?? null;
}

export async function triggerGithubPush({
  deliveryId,
  payload,
  receivedAt = payload?.head_commit?.timestamp ?? new Date().toISOString(),
  fetchImpl,
  ...options
}) {
  if (!deliveryId) {
    throw new Error('GitHub push trigger requires x-github-delivery');
  }

  if (!payload?.repository?.id || !payload?.repository?.full_name || !payload?.ref) {
    throw new Error('GitHub push trigger requires repository and ref fields');
  }

  const state = readRuntimeState(options);
  const config = getFlowcoreConfig(options.env);
  const existingIndex = findEventIndex(state, deliveryId);
  const existingEvent = existingIndex === -1 ? null : state.events[existingIndex];
  const requiresLiveIngestion =
    config.apiKey && existingEvent?.flowcore?.ingestionMode !== 'live';
  const liveIngestion =
    requiresLiveIngestion || !existingEvent
      ? await ingestFlowcoreEvent({ payload, fetchImpl, config })
      : {
          ingestionMode: existingEvent.flowcore?.ingestionMode ?? 'local-only',
          liveEventId: existingEvent.flowcore?.liveEventId ?? null,
          timeBucket: existingEvent.flowcore?.timeBucket ?? null,
          responseStatus: existingEvent.flowcore?.lastResponseStatus ?? null,
          responseBody: null
        };
  const projectedEvent = projectGithubPushEvent({
    deliveryId,
    payload,
    receivedAt,
    persistedEventId: liveIngestion.liveEventId ?? createGithubPushEventId(deliveryId),
    liveIngestion,
    config
  });

  if (existingIndex === -1) {
    state.events.push(projectedEvent);
  } else {
    state.events[existingIndex] = {
      ...projectedEvent,
      runtime: {
        ...projectedEvent.runtime,
        replayCount: existingEvent.runtime?.replayCount ?? 0,
        lastReplayedAt: existingEvent.runtime?.lastReplayedAt ?? null
      },
      replayState: createReplayState({
        replayCount: existingEvent.runtime?.replayCount ?? 0,
        replayPath: projectedEvent.runtime.replayPath,
        ingestionMode: projectedEvent.flowcore.ingestionMode
      }),
      timeline:
        existingEvent.flowcore?.ingestionMode === projectedEvent.flowcore.ingestionMode
          ? existingEvent.timeline
          : projectedEvent.timeline
    };
  }

  state.generatedAt = receivedAt;
  writeRuntimeState(state, options);

  return clone(getRuntimeEventById(projectedEvent.eventId, options));
}

export function replayInboxEvent({
  eventId,
  replayedAt = new Date().toISOString(),
  ...options
}) {
  const state = readRuntimeState(options);
  const eventIndex = state.events.findIndex((event) => event.eventId === eventId);

  if (eventIndex === -1) {
    return null;
  }

  const event = state.events[eventIndex];
  const replayCount = (event.runtime?.replayCount ?? 0) + 1;

  state.events[eventIndex] = {
    ...event,
    replayState: createReplayState({
      replayCount,
      replayPath: event.runtime.replayPath,
      ingestionMode: event.flowcore?.ingestionMode ?? 'local-only'
    }),
    timeline: [
      ...event.timeline,
      {
        label: 'Replay requested for the persisted inbox event',
        at: replayedAt
      }
    ],
    runtime: {
      ...event.runtime,
      replayCount,
      lastReplayedAt: replayedAt
    }
  };
  state.generatedAt = replayedAt;
  writeRuntimeState(state, options);

  return clone(state.events[eventIndex]);
}
