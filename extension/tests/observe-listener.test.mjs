import assert from 'node:assert/strict';
import test from 'node:test';
import { createObserveListener, observedSelectToStep } from '../src/content/observer.js';

function fakeDocument() {
  const handlers = new Map();
  return {
    handlers,
    addEventListener(name, fn, capture) {
      handlers.set(name, { fn, capture });
    },
    removeEventListener(name) {
      handlers.delete(name);
    },
    fire(name, event) {
      handlers.get(name)?.fn(event);
    }
  };
}

function fakeTarget({ attrs = {}, value = '' } = {}) {
  const lower = Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    tagName: 'BUTTON',
    id: attrs.id ?? '',
    value,
    getAttribute(n) {
      const v = lower[String(n).toLowerCase()];
      return v === undefined ? null : String(v);
    }
  };
}

test('listener emits browser_click for trusted clicks with stable anchor', () => {
  const doc = fakeDocument();
  const steps = [];
  const detach = createObserveListener({ documentRef: doc, onStep: s => steps.push(s) });
  doc.fire('click', { type: 'click', isTrusted: true, target: fakeTarget({ attrs: { 'data-testid': 'save' } }) });
  assert.equal(steps.length, 1);
  assert.deepEqual(steps[0], { method: 'browser_click', params: { selector: '[data-testid="save"]' } });
  detach();
  assert.equal(doc.handlers.size, 0);
});

test('listener ignores synthetic AI events and unanchored targets', () => {
  const doc = fakeDocument();
  const steps = [];
  createObserveListener({ documentRef: doc, onStep: s => steps.push(s) });
  doc.fire('click', { type: 'click', isTrusted: false, target: fakeTarget({ attrs: { 'data-testid': 'save' } }) });
  doc.fire('click', { type: 'click', isTrusted: true, target: fakeTarget({ attrs: {} }) });
  assert.equal(steps.length, 0);
});

test('listener emits redacted browser_fill on input', () => {
  const doc = fakeDocument();
  const steps = [];
  createObserveListener({ documentRef: doc, onStep: s => steps.push(s) });
  const target = fakeTarget({ attrs: { id: 'pw', type: 'password' } });
  target.tagName = 'INPUT';
  doc.fire('input', { type: 'input', isTrusted: true, target, value: 's3cret' });
  assert.equal(steps.length, 1);
  assert.deepEqual(steps[0], { method: 'browser_fill', params: { selector: '#pw', value: '{{secret}}' } });
});

test('observedSelectToStep maps select change to browser_select', () => {
  const target = fakeTarget({ attrs: { id: 'country' } });
  target.tagName = 'SELECT';
  target.value = 'ID';
  assert.deepEqual(observedSelectToStep(target, 'ID'), {
    method: 'browser_select',
    params: { selector: '#country', value: 'ID' }
  });
  const text = fakeTarget({ attrs: { id: 'q' } });
  text.tagName = 'INPUT';
  assert.equal(observedSelectToStep(text, 'x'), null);
});

test('listener emits browser_select on trusted change', () => {
  const doc = fakeDocument();
  const steps = [];
  createObserveListener({ documentRef: doc, onStep: s => steps.push(s) });
  const target = fakeTarget({ attrs: { id: 'country' } });
  target.tagName = 'SELECT';
  doc.fire('change', { type: 'change', isTrusted: true, target, value: 'ID' });
  assert.equal(steps.length, 1);
  assert.deepEqual(steps[0], { method: 'browser_select', params: { selector: '#country', value: 'ID' } });
});
