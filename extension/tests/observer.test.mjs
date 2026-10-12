import assert from 'node:assert/strict';
import test from 'node:test';
import { observedClickToStep, observedInputToStep, observedNavigateToStep, stableSelectorFor } from '../src/content/observer.js';

function fakeElement({ tagName = 'BUTTON', attrs = {}, text = '' } = {}) {
  const lower = Object.fromEntries(
    Object.entries(attrs).map(([k, v]) => [k.toLowerCase(), v])
  );
  return {
    tagName,
    id: attrs.id ?? '',
    textContent: text,
    getAttribute(name) {
      const v = lower[String(name).toLowerCase()];
      return v === undefined ? null : String(v);
    }
  };
}

test('stableSelectorFor prefers data-testid as literal selector', () => {
  const el = fakeElement({ tagName: 'BUTTON', attrs: { 'data-testid': 'save' } });
  assert.equal(stableSelectorFor(el), '[data-testid="save"]');
});

test('stableSelectorFor falls back to id then name', () => {
  const byId = fakeElement({ tagName: 'INPUT', attrs: { id: 'email' } });
  assert.equal(stableSelectorFor(byId), '#email');

  const byName = fakeElement({ tagName: 'INPUT', attrs: { name: 'q' } });
  assert.equal(stableSelectorFor(byName), 'input[name="q"]');
});

test('stableSelectorFor sanitizes sloppy aria-labels', () => {
  const el = fakeElement({ tagName: 'BUTTON', attrs: { 'aria-label': '  Show   notifications  ' } });
  assert.equal(stableSelectorFor(el), '[aria-label="Show notifications"]');
});

test('stableSelectorFor falls back to text= for plain buttons and links', () => {
  const btn = fakeElement({ tagName: 'BUTTON', attrs: { class: 'btn' }, text: '  Simpan  Perubahan ' });
  assert.equal(stableSelectorFor(btn), 'text=Simpan Perubahan');
  const div = fakeElement({ tagName: 'DIV', attrs: { class: 'x1' }, text: 'Simpan Perubahan' });
  assert.equal(stableSelectorFor(div), null);
});

test('stableSelectorFor returns null when no stable anchor', () => {
  const el = fakeElement({ tagName: 'DIV', attrs: { class: 'x1' } });
  assert.equal(stableSelectorFor(el), null);
});

test('observedClickToStep maps a testid button to browser_click', () => {
  const el = fakeElement({ tagName: 'BUTTON', attrs: { 'data-testid': 'save' } });
  assert.deepEqual(observedClickToStep(el), {
    method: 'browser_click',
    params: { selector: '[data-testid="save"]' }
  });
});

test('observedClickToStep returns null when unanchored', () => {
  const el = fakeElement({ tagName: 'DIV', attrs: {} });
  assert.equal(observedClickToStep(el), null);
});

test('observedInputToStep maps text input to browser_fill', () => {
  const el = fakeElement({ tagName: 'INPUT', attrs: { 'data-testid': 'q', type: 'text' } });
  assert.deepEqual(observedInputToStep(el, 'hello'), {
    method: 'browser_fill',
    params: { selector: '[data-testid="q"]', value: 'hello' }
  });
});

test('observedInputToStep redacts password value', () => {
  const el = fakeElement({ tagName: 'INPUT', attrs: { id: 'pw', type: 'password' } });
  assert.deepEqual(observedInputToStep(el, 's3cret'), {
    method: 'browser_fill',
    params: { selector: '#pw', value: '{{secret}}' }
  });
});

test('observedNavigateToStep maps url to browser_open', () => {
  assert.deepEqual(observedNavigateToStep('https://example.com/a'), {
    method: 'browser_open',
    params: { url: 'https://example.com/a' }
  });
  assert.equal(observedNavigateToStep('not-a-url'), null);
  assert.equal(observedNavigateToStep(''), null);
});
