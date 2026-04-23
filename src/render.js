import { canonicalEventKeys } from './data/events.js';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function formatTimestamp(value) {
  const date = new Date(value);
  return date.toISOString().replace('.000', '');
}

function renderEnvelope(event) {
  const envelope = Object.fromEntries(
    canonicalEventKeys.map((key) => [key, event[key]])
  );

  return escapeHtml(JSON.stringify(envelope, null, 2));
}

function renderTimeline(event) {
  return event.timeline
    .map(
      (step) => `
        <li class="timeline__item">
          <strong>${escapeHtml(step.label)}</strong>
          <span>${escapeHtml(formatTimestamp(step.at))}</span>
        </li>
      `
    )
    .join('');
}

function renderFlowcoreDetails(event) {
  return `
    <div><dt>Tenant</dt><dd>${escapeHtml(event.flowcore.tenant)}</dd></div>
    <div><dt>Data core</dt><dd>${escapeHtml(event.flowcore.dataCoreId)}</dd></div>
    <div><dt>Flow type</dt><dd>${escapeHtml(event.flowcore.flowType)}</dd></div>
    <div><dt>Time bucket</dt><dd>${escapeHtml(event.flowcore.timeBucket)}</dd></div>
    <div><dt>Ingestion mode</dt><dd>${escapeHtml(event.flowcore.ingestionMode ?? 'local-only')}</dd></div>
    <div><dt>Live event id</dt><dd>${escapeHtml(event.flowcore.liveEventId ?? 'not ingested')}</dd></div>
  `;
}

function renderStoryStrip(activeEvent) {
  const liveMode = activeEvent.flowcore?.ingestionMode === 'live';

  return `
    <section class="story-strip" aria-label="Flowcore and Usable story">
      <article class="story-chip">1. GitHub push deliveries hit the explicit trigger route and land in the persisted runtime store.</article>
      <article class="story-chip">2. ${escapeHtml(
        liveMode
          ? 'Flowcore accepted this event live, and the inbox keeps the returned event id attached to the canonical envelope.'
          : 'This runtime is local-only until FLOWCORE_API_KEY is configured, so the inbox makes that fallback explicit instead of pretending a live Flowcore write happened.'
      )}</article>
      <article class="story-chip">3. Usable-context notes and chat stay linked to the same event journey inside the existing shell.</article>
    </section>
  `;
}

function renderStorageCopy(event) {
  if (event.flowcore?.ingestionMode === 'live') {
    return `
      <p><strong>Stored Flowcore source:</strong> This inbox item is projected from a persisted runtime-backed Flowcore read model.</p>
      <p><strong>Trigger:</strong> <code>POST ${escapeHtml(event.runtime.triggerPath)}</code></p>
      <p><strong>Replay:</strong> <code>POST ${escapeHtml(event.runtime.replayPath)}</code></p>
    `;
  }

  return `
    <p><strong>Stored source:</strong> This inbox item is a local-only persisted runtime event. Live Flowcore ingestion is unavailable until <code>FLOWCORE_API_KEY</code> is configured.</p>
    <p><strong>Trigger:</strong> <code>POST ${escapeHtml(event.runtime.triggerPath)}</code></p>
    <p><strong>Replay:</strong> <code>POST ${escapeHtml(event.runtime.replayPath)}</code></p>
  `;
}

export function renderFeed(events, activeEventId) {
  return events
    .map((event) => {
      const activeClass = event.eventId === activeEventId ? ' event-card--active' : '';
      return `
        <button class="event-card${activeClass}" data-event-id="${escapeHtml(event.eventId)}" type="button">
          <span class="event-card__status event-card__status--${escapeHtml(event.status)}">${escapeHtml(event.status)}</span>
          <strong>${escapeHtml(event.headline)}</strong>
          <p>${escapeHtml(event.summary)}</p>
          <span>${escapeHtml(event.source)} · ${escapeHtml(event.eventType)}</span>
          <span>${escapeHtml(formatTimestamp(event.receivedAt))}</span>
        </button>
      `;
    })
    .join('');
}

export function renderDetail(event) {
  return `
    <section class="detail-panel" aria-labelledby="event-detail-title">
      <div class="panel-heading">
        <p class="eyebrow">Event detail view</p>
        <h2 id="event-detail-title">${escapeHtml(event.headline)}</h2>
      </div>
      <dl class="detail-grid">
        <div><dt>Event ID</dt><dd>${escapeHtml(event.eventId)}</dd></div>
        <div><dt>Source</dt><dd>${escapeHtml(event.sourceType)} from ${escapeHtml(event.source)}</dd></div>
        <div><dt>Status</dt><dd>${escapeHtml(event.status)}</dd></div>
        <div><dt>Entity key</dt><dd>${escapeHtml(event.entityKey)}</dd></div>
        <div><dt>Event type</dt><dd>${escapeHtml(event.eventType)}</dd></div>
        <div><dt>Ingress route</dt><dd>${escapeHtml(event.route)}</dd></div>
      </dl>
      <div class="panel-copy">
        <p><strong>Replay context:</strong> ${escapeHtml(event.replayState)}</p>
      </div>
      <div class="timeline-panel">
        <div class="timeline-panel__header">
          <h3>Event journey</h3>
          <span>Flowcore to Usable</span>
        </div>
        <ul class="timeline-list">${renderTimeline(event)}</ul>
      </div>
      <div class="panel-copy">${renderStorageCopy(event)}</div>
      <dl class="detail-grid">${renderFlowcoreDetails(event)}</dl>
      <pre class="payload-block"><code>${renderEnvelope(event)}</code></pre>
    </section>
  `;
}

export function renderChatPanel(event) {
  const notes = event.notes
    .map(
      (note) => `
        <article class="note-card">
          <div class="note-card__meta">
            <span>${escapeHtml(note.author)}</span>
            <span>${escapeHtml(formatTimestamp(note.savedAt))}</span>
          </div>
          <h3>${escapeHtml(note.title)}</h3>
          <p>${escapeHtml(note.body)}</p>
          <p>Usable fragment: ${escapeHtml(note.fragmentId)}</p>
        </article>
      `
    )
    .join('');

  const transcript = event.chat
    .map(
      (entry) => `
        <article class="chat-entry">
          <strong>${escapeHtml(entry.speaker)}</strong>
          <p>${escapeHtml(entry.message)}</p>
        </article>
      `
    )
    .join('');

  const prompts = event.prompts
    .map((prompt) => `<span class="prompt-chip">${escapeHtml(prompt)}</span>`)
    .join('');

  return `
    <section class="chat-panel" aria-labelledby="usable-chat-title">
      <div class="panel-heading">
        <p class="eyebrow">Usable context panel</p>
        <h2 id="usable-chat-title">Saved notes + chat grounding</h2>
      </div>
      <div class="note-list">${notes}</div>
      <div class="chat-shell">
        <div class="chat-shell__header">
          <span>Usable Chat</span>
          <span>Grounded on event-linked memory</span>
        </div>
        <div class="chat-transcript">${transcript}</div>
        <div class="prompt-strip">${prompts}</div>
      </div>
    </section>
  `;
}

export function renderApp(events, activeEventId) {
  if (!events.length) {
    return `
      <div class="page-shell">
      <header class="hero">
        <div>
          <p class="hero__kicker">Pathway Inbox</p>
          <h1>No persisted events are available yet.</h1>
          <p class="hero__body">Trigger a GitHub push delivery into <code>POST /api/events/trigger/github/push</code> to seed the runtime-backed Flowcore read model.</p>
        </div>
      </header>
    </div>
  `;
  }

  const activeEvent = events.find((event) => event.eventId === activeEventId) ?? events[0];
  const stableEntityKeys = new Set(events.map((event) => event.entityKey)).size;
  const liveMode = activeEvent.flowcore?.ingestionMode === 'live';

  return `
    <div class="page-shell">
      <header class="hero">
        <div>
          <p class="hero__kicker">Pathway Inbox</p>
          <h1>Flowcore handles ingress and replay. Usable turns the aftermath into searchable operator memory.</h1>
          <p class="hero__body">
            ${escapeHtml(
              liveMode
                ? 'This local-first shell now projects a persisted runtime-backed Flowcore read model and its linked Usable-style note into the inbox story.'
                : 'This local-first shell remains runnable without credentials, but the current event is marked local-only until FLOWCORE_API_KEY is configured for live Flowcore ingestion.'
            )}
          </p>
        </div>
        <div class="hero__stat-block">
          <div>
            <span>Active demo source</span>
            <strong>${escapeHtml(liveMode ? 'Live Flowcore GitHub push event' : 'Local-only GitHub push event')}</strong>
          </div>
          <div>
            <span>Canonical envelope fields</span>
            <strong>${canonicalEventKeys.length} core fields</strong>
          </div>
          <div>
            <span>Stable entity keys</span>
            <strong>${stableEntityKeys} tracked journeys</strong>
          </div>
        </div>
      </header>
      ${renderStoryStrip(activeEvent)}
      <main class="workspace-grid">
        <section class="feed-panel" aria-labelledby="event-feed-title">
          <div class="panel-heading">
            <p class="eyebrow">Inbox feed</p>
            <h2 id="event-feed-title">Recent events</h2>
          </div>
          <div class="event-list">${renderFeed(events, activeEvent.eventId)}</div>
        </section>
        ${renderDetail(activeEvent)}
        ${renderChatPanel(activeEvent)}
      </main>
    </div>
  `;
}
