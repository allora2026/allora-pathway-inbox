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
