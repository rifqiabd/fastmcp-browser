import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestPlaceholders } from '../dist/src/paramsuggest.js';

test('suggestPlaceholders flags ISO dates and proposes start/end names', () => {
  const suggestions = suggestPlaceholders([
    { method: 'browser_fill', params: { selector: '#from', value: '2026-10-01' }, replayable: true },
    { method: 'browser_fill', params: { selector: '#to', value: '2026-10-11' }, replayable: true },
    { method: 'browser_fill', params: { selector: '#q', value: 'hello' }, replayable: true }
  ]);
  assert.equal(suggestions.length, 2);
  assert.deepEqual(suggestions[0], {
    index: 0, method: 'browser_fill', param: 'value',
    value: '2026-10-01', name: 'start_date', placeholder: '{{start_date}}'
  });
  assert.deepEqual(suggestions[1].name, 'end_date');
});

test('suggestPlaceholders skips existing placeholders and non-dates', () => {
  const suggestions = suggestPlaceholders([
    { method: 'browser_fill', params: { selector: '#a', value: '{{start_date}}' }, replayable: true },
    { method: 'browser_click', params: { selector: '#go' }, replayable: true }
  ]);
  assert.equal(suggestions.length, 0);
});

test('suggestPlaceholders carries the originating tab url', () => {
  const suggestions = suggestPlaceholders([
    { method: 'browser_fill', params: { selector: '#from', value: '2026-10-01' }, replayable: true, tabUrl: 'https://app.com/form' }
  ]);
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].tabUrl, 'https://app.com/form');
  assert.equal(suggestions[0].name, 'date');
});
