import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestFormGroups } from '../dist/src/formgroup.js';

test('suggestFormGroups groups consecutive fills plus submit click', () => {
  const suggestions = suggestFormGroups([
    { method: 'browser_fill', params: { selector: '#a', value: '1' }, replayable: true },
    { method: 'browser_fill', params: { selector: '#b', value: '2' }, replayable: true },
    { method: 'browser_click', params: { selector: '#save' }, replayable: true },
    { method: 'browser_click', params: { selector: '#other' }, replayable: true }
  ]);
  assert.equal(suggestions.length, 1);
  assert.deepEqual(suggestions[0], {
    startIndex: 0,
    endIndex: 2,
    fields: [
      { selector: '#a', value: '1' },
      { selector: '#b', value: '2' }
    ],
    submitSelector: '#save',
    replacement: {
      method: 'browser_fill_form',
      params: {
        fields: [
          { selector: '#a', value: '1' },
          { selector: '#b', value: '2' }
        ],
        submitSelector: '#save'
      },
      replayable: true
    }
  });
});

test('suggestFormGroups skips single fills and keeps placeholders', () => {
  const single = suggestFormGroups([
    { method: 'browser_fill', params: { selector: '#a', value: '{{start_date}}' }, replayable: true },
    { method: 'browser_click', params: { selector: '#go' }, replayable: true }
  ]);
  assert.equal(single.length, 0);

  const mixed = suggestFormGroups([
    { method: 'browser_fill', params: { selector: '#a', value: '{{start_date}}' }, replayable: true },
    { method: 'browser_select', params: { selector: '#c', value: 'ID' }, replayable: true }
  ]);
  assert.equal(mixed.length, 1);
  assert.equal(mixed[0].fields[0].value, '{{start_date}}');
  assert.equal(mixed[0].submitSelector, undefined);
});

test('suggestFormGroups never merges fields across tabs', () => {
  const suggestions = suggestFormGroups([
    { method: 'browser_fill', params: { selector: '#a', value: '1' }, replayable: true, tabUrl: 'https://a.com/' },
    { method: 'browser_fill', params: { selector: '#b', value: '2' }, replayable: true, tabUrl: 'https://b.com/' }
  ]);
  assert.equal(suggestions.length, 0);
});

test('suggestFormGroups tags the replacement with a uniform tab url', () => {
  const suggestions = suggestFormGroups([
    { method: 'browser_fill', params: { selector: '#a', value: '1' }, replayable: true, tabUrl: 'https://a.com/' },
    { method: 'browser_fill', params: { selector: '#b', value: '2' }, replayable: true, tabUrl: 'https://a.com/' }
  ]);
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].replacement.tabUrl, 'https://a.com/');
});
