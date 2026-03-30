/**
 * Gerencia o estado do scraper em background.
 * O scraper roda independente das conexões SSE dos clientes.
 */
const scraperService = require('./scraperService');

const state = {
  running: false,
  events: [],
  subscribers: new Set(),
};

function getStatus() {
  const lastEvent = state.events.length > 0 ? state.events[state.events.length - 1] : null;
  return { running: state.running, lastEvent };
}

function getEvents() {
  return state.events;
}

function emit(data) {
  state.events.push(data);
  for (const fn of [...state.subscribers]) {
    try {
      fn(data);
    } catch (_) {
      state.subscribers.delete(fn);
    }
  }
}

function subscribe(fn) {
  state.subscribers.add(fn);
  return () => state.subscribers.delete(fn);
}

/**
 * Inicia o scraper em background. Retorna false se já estiver rodando.
 */
function start(searchUrl, maxPages) {
  if (state.running) return false;

  state.running = true;
  state.events = [];

  scraperService
    .runScraper(searchUrl, { maxPages }, emit)
    .then((result) => {
      emit({ type: 'done', collected: result.collected, jobs: result.jobs || [] });
      state.running = false;
    })
    .catch((err) => {
      emit({ type: 'error', error: err.message });
      state.running = false;
    });

  return true;
}

module.exports = { getStatus, getEvents, subscribe, start };
