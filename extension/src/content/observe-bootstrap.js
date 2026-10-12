// Auto-injected content script bootstrap (source). build.mjs strips the
// import/export lines and bundles this after observer.js into
// dist src/content/observe-content.js, so createObserveListener is in scope.
const __fastMcpObserveSend = step => {
  try {
    (globalThis.chrome ?? globalThis.browser)?.runtime?.sendMessage?.({ method: 'observe.step', params: step });
  } catch {
    // Background may be unreachable during navigation; the next page load re-attaches.
  }
};

if (typeof document !== 'undefined' && typeof createObserveListener === 'function') {
  createObserveListener({ documentRef: document, onStep: __fastMcpObserveSend });
}
