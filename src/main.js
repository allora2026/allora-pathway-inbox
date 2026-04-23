import { renderApp } from './render.js';

const app = document.querySelector('#app');
const state = {
  events: [],
  activeEventId: null,
  loading: true,
  error: null,
  context: null,
  contextLoading: false,
  contextError: null,
  actionPending: false
};

function getActiveEventId() {
  return state.activeEventId ?? state.events[0]?.eventId ?? null;
}

function buildContextState() {
  return {
    context: state.context,
    contextLoading: state.contextLoading,
    contextError: state.contextError,
    actionPending: state.actionPending
  };
}

function mount() {
  if (state.loading) {
    app.innerHTML = '<div class="page-shell"><p>Loading Pathway Inbox…</p></div>';
    return;
  }

  if (state.error) {
    app.innerHTML = `<div class="page-shell"><p>${state.error}</p></div>`;
    return;
  }

  app.innerHTML = renderApp(state.events, getActiveEventId(), buildContextState());

  for (const button of app.querySelectorAll('[data-event-id]')) {
    button.addEventListener('click', () => {
      const nextEventId = button.getAttribute('data-event-id') ?? getActiveEventId();

      if (!nextEventId || nextEventId === state.activeEventId) {
        return;
      }

      state.activeEventId = nextEventId;
      state.context = null;
      state.contextError = null;
      state.contextLoading = true;
      window.location.hash = state.activeEventId;
      mount();
      void loadContext(nextEventId);
    });
  }

  const refreshButton = app.querySelector('[data-context-action="refresh"]');

  if (refreshButton) {
    refreshButton.addEventListener('click', () => {
      const activeEventId = getActiveEventId();

      if (!activeEventId || state.actionPending) {
        return;
      }

      void refreshContext(activeEventId);
    });
  }
}

function syncHashSelection() {
  const hashEventId = window.location.hash.replace('#', '');

  if (hashEventId && state.events.some((event) => event.eventId === hashEventId)) {
    state.activeEventId = hashEventId;
  }
}

async function requestJson(pathname, options) {
  const response = await fetch(pathname, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error ?? `Request failed: ${response.status}`);
  }

  return data;
}

async function loadContext(eventId) {
  if (!eventId) {
    state.context = null;
    state.contextError = null;
    state.contextLoading = false;
    mount();
    return;
  }

  state.contextLoading = true;
  state.contextError = null;
  mount();

  try {
    state.context = await requestJson(`/api/events/${eventId}/context`);
  } catch (error) {
    state.context = null;
    state.contextError = `Pathway Inbox could not load linked Usable context. ${error.message}`;
  } finally {
    state.contextLoading = false;
    mount();
  }
}

async function refreshContext(eventId) {
  state.actionPending = true;
  state.contextError = null;
  mount();

  try {
    state.context = await requestJson(`/api/events/${eventId}/context/refresh`, {
      method: 'POST'
    });
  } catch (error) {
    state.contextError = `Pathway Inbox could not refresh linked Usable context. ${error.message}`;
  } finally {
    state.actionPending = false;
    state.contextLoading = false;
    mount();
  }
}

async function loadEvents() {
  mount();

  try {
    state.events = await requestJson('/api/events');
    state.loading = false;
    syncHashSelection();
    state.activeEventId = getActiveEventId();
    await loadContext(state.activeEventId);
  } catch (error) {
    state.loading = false;
    state.error = `Pathway Inbox could not load the runtime-backed Flowcore read model. ${error.message}`;
    mount();
  }
}

window.addEventListener('hashchange', () => {
  const previousEventId = state.activeEventId;
  syncHashSelection();

  if (state.activeEventId && state.activeEventId !== previousEventId) {
    void loadContext(state.activeEventId);
  }
});

void loadEvents();
