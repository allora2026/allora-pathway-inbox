import { renderApp } from './render.js';

const app = document.querySelector('#app');
const state = {
  events: [],
  activeEventId: null,
  loading: true,
  error: null
};

function mount() {
  if (state.loading) {
    app.innerHTML = '<div class="page-shell"><p>Loading Pathway Inbox…</p></div>';
    return;
  }

  if (state.error) {
    app.innerHTML = `<div class="page-shell"><p>${state.error}</p></div>`;
    return;
  }

  app.innerHTML = renderApp(state.events, state.activeEventId);

  for (const button of app.querySelectorAll('[data-event-id]')) {
    button.addEventListener('click', () => {
      state.activeEventId = button.getAttribute('data-event-id') ?? state.activeEventId;
      window.location.hash = state.activeEventId;
      mount();
    });
  }
}

function syncHashSelection() {
  const hashEventId = window.location.hash.replace('#', '');

  if (hashEventId && state.events.some((event) => event.eventId === hashEventId)) {
    state.activeEventId = hashEventId;
    mount();
  }
}

async function loadEvents() {
  mount();

  try {
    const response = await fetch('/api/events');

    if (!response.ok) {
      throw new Error(`Failed to load inbox events: ${response.status}`);
    }

    state.events = await response.json();
    state.activeEventId = state.events[0]?.eventId ?? null;
    state.loading = false;
    syncHashSelection();
    mount();
  } catch (error) {
    state.loading = false;
    state.error = `Pathway Inbox could not load the runtime-backed Flowcore read model. ${error.message}`;
    mount();
  }
}

window.addEventListener('hashchange', syncHashSelection);

loadEvents();
