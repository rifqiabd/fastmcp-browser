import assert from 'node:assert/strict';
import test from 'node:test';
import { createObserveBuffer } from '../src/observe-buffer.js';
import { observedNavigateToStep, routeObserveMessage, createNavDeduper } from '../src/observe-route.js';

function makeBuffer() {
  const emitted = [];
  const buffer = createObserveBuffer({ emit: (m, p) => emitted.push({ m, p }) });
  return { buffer, emitted };
}

test('route forwards content observe.step into the buffer', () => {
  const { buffer, emitted } = makeBuffer();
  buffer.setEnabled(true);
  const res = routeObserveMessage(
    { method: 'observe.step', params: { method: 'browser_click', params: { selector: '#a' } } },
    buffer
  );
  assert.deepEqual(res, { accepted: true });
  assert.equal(emitted.length, 1);
  assert.equal(buffer.steps().length, 1);
});

test('route toggles and reports observe state for the popup', () => {
  const { buffer } = makeBuffer();
  buffer.setEnabled(true);
  assert.equal(buffer.isEnabled(), true);
  assert.deepEqual(routeObserveMessage({ method: 'observe.setEnabled', params: { enabled: false } }, buffer), { enabled: false });
  assert.equal(buffer.isEnabled(), false);
  const state = routeObserveMessage({ method: 'observe.get' }, buffer);
  assert.equal(state.enabled, false);
  assert.equal(state.count, 0);
});

test('route ignores unrelated messages', () => {
  const { buffer, emitted } = makeBuffer();
  assert.equal(routeObserveMessage({ method: 'status.get' }, buffer), undefined);
  assert.equal(routeObserveMessage(null, buffer), undefined);
  assert.equal(emitted.length, 0);
});

test('observedNavigateToStep builds browser_open for http urls only', () => {
  assert.deepEqual(observedNavigateToStep('https://example.com/a'), {
    method: 'browser_open',
    params: { url: 'https://example.com/a' }
  });
  assert.equal(observedNavigateToStep('chrome://extensions'), null);
});

test('nav deduper collapses iframe repeat completes per tab', () => {
  const dedup = createNavDeduper();
  assert.equal(dedup.shouldRecord(7, 'https://a.com/s3'), true);
  assert.equal(dedup.shouldRecord(7, 'https://a.com/s3'), false);
  assert.equal(dedup.shouldRecord(7, 'https://a.com/s3'), false);
  assert.equal(dedup.shouldRecord(7, 'https://a.com/s4'), true);
  assert.equal(dedup.shouldRecord(9, 'https://a.com/s4'), true);
  assert.equal(dedup.shouldRecord(7, 'https://a.com/s3'), true);
});

test('route flushes pending fill on observe.get so typing is not stuck', () => {
  const { buffer, emitted } = makeBuffer();
  buffer.setEnabled(true);
  buffer.push({ method: 'browser_fill', params: { selector: '#q', value: 'hello' } });
  assert.equal(emitted.length, 0);
  const state = routeObserveMessage({ method: 'observe.get' }, buffer);
  assert.equal(emitted.length, 1);
  assert.equal(state.count, 1);
});

test('route tags steps with the sender tab url', () => {
  const { buffer, emitted } = makeBuffer();
  buffer.setEnabled(true);
  const res = routeObserveMessage(
    { method: 'observe.step', params: { method: 'browser_click', params: { selector: '#a' } } },
    buffer,
    { tab: { id: 7, url: 'https://a.com/x' } }
  );
  assert.deepEqual(res, { accepted: true });
  assert.equal(emitted[0].p.tabUrl, 'https://a.com/x');
  assert.equal(buffer.steps()[0].tabUrl, 'https://a.com/x');
});

test('observe.get reports dropped and lastTab for the popup', () => {
  const { buffer } = makeBuffer();
  buffer.setEnabled(true);
  buffer.push(
    { method: 'browser_click', params: { selector: '#a' } },
    { tabUrl: 'https://a.com/', tabTitle: 'A' }
  );
  const state = routeObserveMessage({ method: 'observe.get' }, buffer);
  assert.equal(state.dropped, 0);
  assert.deepEqual(state.lastTab, { url: 'https://a.com/', title: 'A' });
});

test('observe.save finalizes the session and auto-pauses', () => {
  const { buffer, emitted } = makeBuffer();
  buffer.setEnabled(true);
  buffer.push({ method: 'browser_click', params: { selector: '#a' } });
  buffer.push({ method: 'browser_fill', params: { selector: '#q', value: 'hi' } });
  const res = routeObserveMessage({ method: 'observe.save' }, buffer);
  assert.equal(res.saved, true);
  assert.equal(res.count, 2);
  assert.equal(emitted.length, 2);
  assert.equal(buffer.isEnabled(), false);
  assert.deepEqual(buffer.steps(), []);
});

test('observe.save with an empty buffer is an honest no-op', () => {
  const { buffer, emitted } = makeBuffer();
  buffer.setEnabled(true);
  const res = routeObserveMessage({ method: 'observe.save' }, buffer);
  assert.deepEqual(res, { saved: false, reason: 'buffer empty' });
  assert.equal(emitted.length, 0);
  assert.equal(buffer.isEnabled(), true);
});
