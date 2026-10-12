import assert from 'node:assert/strict';
import test from 'node:test';
import { createObserveBuffer } from '../src/observe-buffer.js';

test('buffer is paused by default and records nothing until resumed', () => {
  const emitted = [];
  const buf = createObserveBuffer({ emit: (m, p) => emitted.push({ m, p }) });
  assert.equal(buf.isEnabled(), false);
  buf.push({ method: 'browser_click', params: { selector: '#a' } });
  assert.equal(emitted.length, 0);
  assert.equal(buf.steps().length, 0);
  buf.setEnabled(true);
  buf.push({ method: 'browser_click', params: { selector: '#a' } });
  assert.equal(emitted.length, 1);
});

test('buffer emits observe.step and mirrors it locally', () => {
  const emitted = [];
  const buf = createObserveBuffer({ emit: (m, p) => emitted.push({ m, p }) });
  buf.setEnabled(true);
  buf.push({ method: 'browser_click', params: { selector: '[data-testid="save"]' } });
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].m, 'observe.step');
  assert.deepEqual(emitted[0].p, { method: 'browser_click', params: { selector: '[data-testid="save"]' } });
  assert.equal(buf.steps().length, 1);
});

test('buffer dedups consecutive identical steps', () => {
  const emitted = [];
  const buf = createObserveBuffer({ emit: (m, p) => emitted.push({ m, p }) });
  buf.setEnabled(true);
  const step = { method: 'browser_click', params: { selector: '#a' } };
  buf.push(step);
  buf.push(step);
  buf.push({ method: 'browser_click', params: { selector: '#b' } });
  assert.equal(emitted.length, 2);
});

test('buffer respects enabled flag and caps the mirror', () => {
  const emitted = [];
  const buf = createObserveBuffer({ emit: (m, p) => emitted.push({ m, p }), maxSize: 2 });
  buf.setEnabled(false);
  buf.push({ method: 'browser_click', params: { selector: '#a' } });
  assert.equal(emitted.length, 0);
  buf.setEnabled(true);
  buf.push({ method: 'browser_click', params: { selector: '#a' } });
  buf.push({ method: 'browser_click', params: { selector: '#b' } });
  buf.push({ method: 'browser_click', params: { selector: '#c' } });
  assert.equal(emitted.length, 3);
  assert.deepEqual(buf.steps().map(s => s.params.selector), ['#b', '#c']);
});

test('buffer coalesces rapid fills on one selector into one emit on flush', () => {
  const emitted = [];
  const buf = createObserveBuffer({ emit: (m, p) => emitted.push({ m, p }) });
  buf.setEnabled(true);
  buf.push({ method: 'browser_fill', params: { selector: '#q', value: 'h' } });
  buf.push({ method: 'browser_fill', params: { selector: '#q', value: 'he' } });
  buf.push({ method: 'browser_fill', params: { selector: '#q', value: 'hello' } });
  assert.equal(emitted.length, 0);
  assert.equal(buf.steps().length, 0);
  const flushed = buf.flush();
  assert.deepEqual(flushed, { method: 'browser_fill', params: { selector: '#q', value: 'hello' } });
  assert.equal(emitted.length, 1);
  assert.deepEqual(emitted[0].p.params, { selector: '#q', value: 'hello' });
});

test('buffer flushes pending fill before a different step', () => {
  const emitted = [];
  const buf = createObserveBuffer({ emit: (m, p) => emitted.push({ m, p }) });
  buf.setEnabled(true);
  buf.push({ method: 'browser_fill', params: { selector: '#q', value: 'hello' } });
  buf.push({ method: 'browser_click', params: { selector: '#go' } });
  assert.equal(emitted.length, 2);
  assert.deepEqual(emitted[0].p.params, { selector: '#q', value: 'hello' });
  assert.deepEqual(emitted[1].p.params, { selector: '#go' });
});

test('buffer does not coalesce fills from different tabs', () => {
  const emitted = [];
  const buf = createObserveBuffer({ emit: (m, p) => emitted.push({ m, p }) });
  buf.setEnabled(true);
  buf.push({ method: 'browser_fill', params: { selector: '#q', value: 'a1' } }, { tabUrl: 'https://a.com/' });
  buf.push({ method: 'browser_fill', params: { selector: '#q', value: 'b1' } }, { tabUrl: 'https://b.com/' });
  buf.flush();
  assert.equal(emitted.length, 2);
  assert.equal(emitted[0].p.tabUrl, 'https://a.com/');
  assert.equal(emitted[1].p.tabUrl, 'https://b.com/');
});

test('pause clears the mirror but keeps an in-flight fill for resume', () => {
  const emitted = [];
  const buf = createObserveBuffer({ emit: (m, p) => emitted.push({ m, p }) });
  buf.setEnabled(true);
  buf.push({ method: 'browser_click', params: { selector: '#a' } });
  buf.push({ method: 'browser_fill', params: { selector: '#q', value: 'hel' } });
  buf.setEnabled(false);
  assert.deepEqual(buf.steps(), []);
  assert.equal(emitted.length, 1);
  buf.setEnabled(true);
  assert.equal(emitted.length, 2);
  assert.deepEqual(emitted[1].p.params, { selector: '#q', value: 'hel' });
});

test('typing while paused is dropped and does not kill the grace fill', () => {
  const emitted = [];
  const buf = createObserveBuffer({ emit: (m, p) => emitted.push({ m, p }) });
  buf.setEnabled(true);
  buf.push({ method: 'browser_fill', params: { selector: '#q', value: 'hel' } });
  buf.setEnabled(false);
  buf.push({ method: 'browser_fill', params: { selector: '#q', value: 'hello' } });
  buf.push({ method: 'browser_click', params: { selector: '#x' } });
  assert.equal(emitted.length, 0);
  buf.setEnabled(true);
  assert.equal(emitted.length, 1);
  assert.deepEqual(emitted[0].p.params, { selector: '#q', value: 'hel' });
});

test('buffer counts overflow drops and tracks the last tab', () => {
  const emitted = [];
  const buf = createObserveBuffer({ emit: (m, p) => emitted.push({ m, p }), maxSize: 2 });
  buf.setEnabled(true);
  buf.push({ method: 'browser_click', params: { selector: '#a' } }, { tabUrl: 'https://a.com/', tabTitle: 'A' });
  buf.push({ method: 'browser_click', params: { selector: '#b' } }, { tabUrl: 'https://b.com/', tabTitle: 'B' });
  buf.push({ method: 'browser_click', params: { selector: '#c' } }, { tabUrl: 'https://c.com/', tabTitle: 'C' });
  assert.equal(buf.dropped(), 1);
  assert.deepEqual(buf.lastTab(), { url: 'https://c.com/', title: 'C' });
  assert.deepEqual(buf.steps().map(s => s.params.selector), ['#b', '#c']);
});

test('failed emits stay queued and resend in order on reconnect', () => {
  const emitted = [];
  let online = false;
  const buf = createObserveBuffer({ emit: (m, p) => { if (!online) return false; emitted.push({ m, p }); return true; } });
  buf.setEnabled(true);
  buf.push({ method: 'browser_click', params: { selector: '#a' } });
  buf.push({ method: 'browser_click', params: { selector: '#b' } });
  assert.equal(emitted.length, 0);
  assert.equal(buf.steps().length, 2);
  online = true;
  assert.equal(buf.resend(), 2);
  assert.deepEqual(emitted.map(e => e.p.params.selector), ['#a', '#b']);
  assert.equal(buf.resend(), 0);
});
