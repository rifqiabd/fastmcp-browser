// Popup/content message routing for observe-mode (slice 2.3, pure + B1).
// background.js delegates here so the contract is unit-testable without
// browser APIs: content scripts send observe.step, the popup sends
// observe.setEnabled/observe.get. Anything else returns undefined so the
// existing status/disconnect handler keeps working.
// Slice B1: the runtime sender ({ tab: { url } }) tags each step with its
// originating tab so a recording that hops tabs stays attributable.

export function observedNavigateToStep(url) {
  if (typeof url !== 'string' || !/^https?:\/\/\S+$/i.test(url)) return null;
  return { method: 'browser_open', params: { url } };
}

function senderTabUrl(sender) {
  const url = sender?.tab?.url;
  return typeof url === 'string' && url ? url : undefined;
}

// Per-tab last-URL gate for navigations. tabs.onUpdated(status=complete)
// fires once per frame — a page with iframes (e.g. Moodle) reports one user
// navigation N times. The buffer dedups consecutive identical payloads, but
// each firing can carry a slightly different tab.url snapshot, so the gate
// lives at the source: one browser_open per URL per tab until it changes.
export function createNavDeduper() {
  const lastByTab = new Map();
  return {
    shouldRecord(tabId, url) {
      if (!Number.isInteger(tabId) || typeof url !== 'string' || !url) return false;
      if (lastByTab.get(tabId) === url) return false;
      lastByTab.set(tabId, url);
      return true;
    }
  };
}

export function routeObserveMessage(message, buffer, sender) {
  const method = message?.method;
  if (!buffer || typeof method !== 'string') return undefined;
  if (method === 'observe.step') {
    const params = message?.params;
    if (!params || typeof params !== 'object') return undefined;
    const tabUrl = senderTabUrl(sender) ?? (typeof params.tabUrl === 'string' ? params.tabUrl : undefined);
    const accepted = buffer.push(
      { method: params.method, params: params.params },
      tabUrl ? { tabUrl } : undefined
    );
    return { accepted: Boolean(accepted) };
  }
  if (method === 'observe.setEnabled') {
    const enabled = message?.params?.enabled !== false;
    buffer.setEnabled(enabled);
    return { enabled: buffer.isEnabled() };
  }
  if (method === 'observe.get') {
    buffer.flush?.();
    return {
      enabled: buffer.isEnabled(),
      count: buffer.steps().length,
      dropped: typeof buffer.dropped === 'function' ? buffer.dropped() : 0,
      lastTab: typeof buffer.lastTab === 'function' ? buffer.lastTab() : null
    };
  }
  if (method === 'observe.save') {
    buffer.flush?.();
    const count = buffer.steps().length;
    if (!count) return { saved: false, reason: 'buffer empty' };
    buffer.clear();
    buffer.setEnabled(false);
    return { saved: true, count };
  }
  return undefined;
}
