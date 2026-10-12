// Background-side observe buffer (slice 2.2-3.1, B1, C1).
// Pure: emit() is injected so tests use a literal array. Dedups consecutive
// identical steps (double-fire click+input) and caps the local mirror so the
// popup can preview without unbounded growth. Recording itself is still gated
// server-side by `record start` (see server/src/observe.ts).
// Slice 3.1: rapid browser_fill on one selector coalesces — keystrokes
// h/he/hello emit once on flush(), not per letter.
// Slice B1: push(step, { tabUrl }) tags the originating tab; coalesce and
// dedup compare tabUrl too so two tabs never merge into one step.
// Slice C1: Pause clears the mirror but keeps one in-flight fill as grace,
// flushed on Resume. Overflow drops are counted (dropped()), failed emits
// stay queued for resend() on reconnect. lastTab() tracks the most recently
// observed tab for the popup.

export function createObserveBuffer({ emit, maxSize = 200, enabled = false } = {}) {
  if (typeof emit !== 'function') throw Object.assign(new Error('emit is required'), { code: 'INVALID_ARGUMENT' });
  const size = Number.isSafeInteger(maxSize) && maxSize > 0 ? maxSize : 200;
  // Paused by default: the user resumes explicitly from the popup so nothing
  // is captured silently. Pass { enabled: true } only in tests/manual override.
  let on = enabled === true;
  let mirror = [];
  let lastKey = null;
  let pendingFill = null;
  let dropped = 0;
  let lastTab = null;
  let unsent = [];

  const keyOf = step => {
    try {
      return `${step?.method}|${JSON.stringify(step?.params ?? null)}|${step?.tabUrl ?? ''}`;
    } catch {
      return null;
    }
  };

  const selectorOf = step => {
    const selector = step?.params?.selector;
    return typeof selector === 'string' && selector ? selector : null;
  };

  const tabOf = step => (typeof step?.tabUrl === 'string' && step.tabUrl ? step.tabUrl : null);

  function withContext(step, context) {
    const tabUrl = typeof context?.tabUrl === 'string' && context.tabUrl
      ? context.tabUrl
      : tabOf(step);
    if (!tabUrl || tabOf(step)) return step;
    return { ...step, tabUrl };
  }

  function payloadOf(step) {
    const payload = { method: step.method, params: step.params ?? {} };
    if (tabOf(step)) payload.tabUrl = tabOf(step);
    return payload;
  }

  function trim() {
    if (mirror.length > size) {
      const excess = mirror.length - size;
      dropped += excess;
      mirror = mirror.slice(excess);
      const kept = new Set(mirror);
      unsent = unsent.filter(step => kept.has(step));
    }
  }

  function tryEmit(step) {
    try {
      return emit('observe.step', payloadOf(step)) !== false;
    } catch {
      return false;
    }
  }

  function emitNow(step) {
    const key = keyOf(step);
    if (key !== null && key === lastKey) return null;
    lastKey = key;
    mirror.push(step);
    trim();
    if (!tryEmit(step)) unsent.push(step);
    return step;
  }

  function flushPending() {
    if (!pendingFill) return null;
    const pending = pendingFill;
    pendingFill = null;
    return emitNow(pending);
  }

  return {
    setEnabled(value) {
      const next = value !== false;
      if (!next) {
        // Pause: discard the mirror (Q1b), keep one in-flight fill as grace
        // (Q9b) — it flushes on Resume instead of vanishing silently.
        mirror = [];
        lastKey = null;
        dropped = 0;
      } else if (!on) {
        // Resume: flush the grace fill kept across the pause.
        flushPending();
      }
      on = next;
    },
    isEnabled() {
      return on;
    },
    steps() {
      return [...mirror];
    },
    dropped() {
      return dropped;
    },
    lastTab() {
      return lastTab ? { ...lastTab } : null;
    },
    clear() {
      mirror = [];
      lastKey = null;
      pendingFill = null;
      dropped = 0;
      // The resend queue and lastTab survive: unsent steps must still reach
      // the server, and the popup keeps showing where they came from.
    },
    flush() {
      if (!on) return null;
      return flushPending();
    },
    resend() {
      if (!unsent.length) return 0;
      const backlog = unsent;
      unsent = [];
      let delivered = 0;
      for (let index = 0; index < backlog.length; index += 1) {
        const step = backlog[index];
        if (!mirror.includes(step)) continue;
        if (tryEmit(step)) {
          delivered += 1;
          lastKey = keyOf(step);
        } else {
          unsent.push(...backlog.slice(index).filter(kept => mirror.includes(kept)));
          break;
        }
      }
      return delivered;
    },
    push(step, context) {
      if (!step || typeof step.method !== 'string') return null;
      const tagged = withContext(step, context);
      const tab = tabOf(tagged);
      if (tab) {
        const title = typeof context?.tabTitle === 'string' && context.tabTitle ? context.tabTitle : undefined;
        lastTab = title ? { url: tab, title } : { url: tab };
      }
      if (!on) return null;
      if (tagged.method === 'browser_fill' && selectorOf(tagged)) {
        if (pendingFill && selectorOf(pendingFill) === selectorOf(tagged) && tabOf(pendingFill) === tabOf(tagged)) {
          pendingFill = tagged;
          return null;
        }
        const flushed = flushPending();
        pendingFill = tagged;
        return flushed;
      }
      const flushed = flushPending();
      const emitted = emitNow(tagged);
      return emitted ?? flushed;
    }
  };
}
