import { canonicalEventKeys } from './data/events.js';
import { getRuntimeEventById, loadRuntimeEvents } from './runtime-store.js';

function validateEvent(event) {
  for (const key of canonicalEventKeys) {
    if (!event[key]) {
      throw new Error(`Projected event is missing canonical key "${key}"`);
    }
  }

  return event;
}

export function loadInboxEvents(options) {
  return loadRuntimeEvents(options).map(validateEvent);
}

export function getInboxEventById(eventId, options) {
  const event = getRuntimeEventById(eventId, options);
  return event ? validateEvent(event) : null;
}

export function getEventContextById(eventId, options) {
  const event = getInboxEventById(eventId, options);

  if (!event) {
    return null;
  }

  if (event.usable?.fragmentId) {
    return {
      eventId: event.eventId,
      fragmentId: event.usable.fragmentId,
      workspaceId: event.usable.workspaceId,
      url: event.usable.url,
      title: event.usable.title,
      content: event.usable.content,
      lastSyncedAt: event.usable.lastSyncedAt,
      refreshPath: `/api/events/${event.eventId}/context/refresh`
    };
  }

  return {
    eventId: event.eventId,
    fragmentId: null,
    workspaceId: null,
    url: null,
    title: 'Usable link unavailable',
    content:
      'No real Usable fragment is linked to this event yet. Configure USABLE_ACCESS_TOKEN and refresh the linked memory to create one.',
    lastSyncedAt: null,
    refreshPath: `/api/events/${event.eventId}/context/refresh`
  };
}
