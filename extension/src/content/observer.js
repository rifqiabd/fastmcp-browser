// Passive observe-mode selector + click mapping (slice 1.1-1.2).
// Pure by design so it is unit-testable without a DOM: tests pass a
// literal fake { tagName, id, getAttribute } instead of a live Element.

function readAttr(element, name) {
  try {
    const value = element?.getAttribute?.(name);
    return typeof value === 'string' && value ? value : null;
  } catch {
    return null;
  }
}

function escapeDouble(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// Same hygiene as the snapshot engine (semantics.js sanitizeText): collapse
// whitespace and trim, so a sloppy or count-bearing label still replays.
// Dynamic counts ("3 new notifications") cannot be stabilized here — the AI
// adapts those in guided mode — but at least the selector is well-formed.
function cleanText(value, maxLength = 80) {
  if (value == null) return '';
  return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function stableSelectorFor(element) {
  if (!element) return null;
  const testId = readAttr(element, 'data-testid') ?? readAttr(element, 'data-test-id');
  if (testId) return `[data-testid="${escapeDouble(testId)}"]`;

  const id = typeof element.id === 'string' && element.id
    ? element.id
    : readAttr(element, 'id');
  if (id) {
    if (/^[A-Za-z][\w-]*$/.test(id)) return `#${id}`;
    return `[id="${escapeDouble(id)}"]`;
  }

  const tag = String(element.tagName ?? '').toLowerCase();
  const name = readAttr(element, 'name');
  if (name && tag) return `${tag}[name="${escapeDouble(name)}"]`;

  const label = cleanText(readAttr(element, 'aria-label'));
  if (label) return `[aria-label="${escapeDouble(label)}"]`;

  // Last resort for plain buttons/links with visible text but no attributes
  // (extremely common on real sites). The page engine already resolves
  // `text=` (see engine.js resolveSelector), so these replay.
  if (tag === 'button' || tag === 'a' || readAttr(element, 'role') === 'button' || readAttr(element, 'role') === 'link') {
    const text = cleanText(element.textContent, 50);
    if (text) return `text=${text}`;
  }

  return null;
}

export function observedClickToStep(element) {
  const selector = stableSelectorFor(element);
  if (!selector) return null;
  return { method: 'browser_click', params: { selector } };
}

function isSensitiveInput(element) {
  const type = (readAttr(element, 'type') ?? '').toLowerCase();
  if (type === 'password') return true;
  const autocomplete = (readAttr(element, 'autocomplete') ?? '').toLowerCase();
  return autocomplete === 'cc-number' || autocomplete === 'cc-csc' || autocomplete === 'current-password' || autocomplete === 'new-password';
}

export function observedInputToStep(element, value) {
  const selector = stableSelectorFor(element);
  if (!selector) return null;
  return {
    method: 'browser_fill',
    params: { selector, value: isSensitiveInput(element) ? '{{secret}}' : String(value ?? '') }
  };
}

export function observedNavigateToStep(url) {
  if (typeof url !== 'string' || !/^https?:\/\/\S+$/i.test(url)) return null;
  return { method: 'browser_open', params: { url } };
}

export function observedSelectToStep(element, value) {
  const tag = String(element?.tagName ?? '').toLowerCase();
  const role = (readAttr(element, 'role') ?? '').toLowerCase();
  const isSelect = tag === 'select' || role === 'combobox' || role === 'listbox';
  if (!isSelect) return null;
  const selector = stableSelectorFor(element);
  if (!selector) return null;
  const option = typeof value === 'string' ? value : element?.value;
  if (typeof option !== 'string' || !option) return null;
  return { method: 'browser_select', params: { selector, value: option } };
}

// Live listener (slice 2.1): capture-phase, trusted-only so AI-driven
// engine.click()/fill() (synthetic, isTrusted=false) never double-records.
export function createObserveListener({ documentRef, onStep } = {}) {
  if (typeof documentRef?.addEventListener !== 'function' || typeof onStep !== 'function') {
    return () => {};
  }
  const trusted = event => event?.isTrusted !== false;
  const onClick = event => {
    if (!trusted(event)) return;
    const step = observedClickToStep(event?.target);
    if (step) onStep(step);
  };
  const onInput = event => {
    if (!trusted(event) || !event?.target) return;
    const value = typeof event.value === 'string' ? event.value : event.target.value;
    const step = observedInputToStep(event.target, value);
    if (step) onStep(step);
  };
  const onChange = event => {
    if (!trusted(event) || !event?.target) return;
    const value = typeof event.value === 'string' ? event.value : event.target.value;
    const step = observedSelectToStep(event.target, value);
    if (step) onStep(step);
  };
  documentRef.addEventListener('click', onClick, true);
  documentRef.addEventListener('input', onInput, true);
  documentRef.addEventListener('change', onChange, true);
  return () => {
    documentRef.removeEventListener?.('click', onClick);
    documentRef.removeEventListener?.('input', onInput);
    documentRef.removeEventListener?.('change', onChange);
  };
}
