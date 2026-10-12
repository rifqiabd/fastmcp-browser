import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readFile, rm } from 'node:fs/promises';
import { handleBridgeEvent, ingestObservedStep, observedToRecordedStep } from '../dist/src/observe.js';
import { parseRunFile } from '../dist/src/record.js';
import { startRecording, stopRecording, recordingStatus } from '../dist/src/recorder.js';

test('observedToRecordedStep keeps an observed click replayable', () => {
  const step = observedToRecordedStep('browser_click', { selector: '[data-testid="save"]' });
  assert.ok(step);
  assert.equal(step.method, 'browser_click');
  assert.deepEqual(step.params, { selector: '[data-testid="save"]' });
  assert.equal(step.replayable, true);
});

test('observedToRecordedStep keeps a redacted fill replayable', () => {
  const step = observedToRecordedStep('browser_fill', { selector: '#pw', value: '{{secret}}' });
  assert.ok(step);
  assert.equal(step.replayable, true);
});

test('observedToRecordedStep drops unknown methods and bad params', () => {
  assert.equal(observedToRecordedStep('bogus_tool', { selector: 'x' }), null);
  assert.equal(observedToRecordedStep('browser_click', null), null);
  const refOnly = observedToRecordedStep('browser_click', { ref: 'e1' });
  assert.ok(refOnly);
  assert.equal(refOnly.replayable, false);
});

test('ingestObservedStep appends while recording and is a no-op otherwise', async () => {
  const file = join(tmpdir(), `fastmcp-observe-${Date.now()}.jsonl`);
  stopRecording();
  assert.equal(await ingestObservedStep('browser_click', { selector: '[data-testid="save"]' }), null);

  startRecording(file);
  try {
    const step = await ingestObservedStep('browser_click', { selector: '[data-testid="save"]' });
    assert.ok(step);
    await ingestObservedStep('browser_open', { url: 'https://example.com/a' });
    const steps = parseRunFile(await readFile(file, 'utf8'));
    assert.equal(steps.length, 2);
    assert.equal(steps[0].method, 'browser_click');
    assert.equal(steps[1].method, 'browser_open');
  } finally {
    stopRecording();
    await rm(file, { force: true });
  }
});

test('handleBridgeEvent records observe.step and ignores other events', async () => {
  const file = join(tmpdir(), `fastmcp-observe-event-${Date.now()}.jsonl`);
  startRecording(file);
  try {
    const recorded = await handleBridgeEvent({
      method: 'observe.step',
      params: { method: 'browser_click', params: { selector: '[data-testid="save"]' } }
    });
    assert.ok(recorded);
    assert.equal(recorded.method, 'browser_click');
    const ignored = await handleBridgeEvent({ method: 'tab.updated', params: {} });
    assert.equal(ignored, null);
    const steps = parseRunFile(await readFile(file, 'utf8'));
    assert.equal(steps.length, 1);
  } finally {
    stopRecording();
    await rm(file, { force: true });
  }
});

test('ingestObservedStep keeps the tab url annotation through the file', async () => {
  const file = join(tmpdir(), `fastmcp-observe-tab-${Date.now()}.jsonl`);
  startRecording(file);
  try {
    const step = await ingestObservedStep(
      'browser_click',
      { selector: '#a' },
      { tabUrl: 'https://a.com/x' }
    );
    assert.ok(step);
    assert.equal(step.tabUrl, 'https://a.com/x');
    const [roundTripped] = parseRunFile(await readFile(file, 'utf8'));
    assert.equal(roundTripped.tabUrl, 'https://a.com/x');
    assert.equal(roundTripped.replayable, true);
  } finally {
    stopRecording();
    await rm(file, { force: true });
  }
});

test('ingest counts written steps in recording status', async () => {
  const file = join(tmpdir(), `fastmcp-observe-count-${Date.now()}.jsonl`);
  startRecording(file);
  try {
    await ingestObservedStep('browser_click', { selector: '#a' });
    await ingestObservedStep('browser_click', { selector: '#b' });
    const status = recordingStatus();
    assert.equal(status.recording, true);
    assert.equal(status.written, 2);
  } finally {
    stopRecording();
    await rm(file, { force: true });
  }
});

test('observe.save without an active file starts the default recordings file', async () => {
  stopRecording();
  const saved = await handleBridgeEvent({ method: 'observe.save', params: { count: 3 } });
  try {
    assert.ok(saved);
    assert.equal(saved.saved, true);
    assert.equal(saved.count, 3);
    assert.match(saved.file, /recordings/);
    assert.match(saved.file, /\.jsonl$/);
    await assert.rejects(readFile(saved.file, 'utf8'));
    const status = recordingStatus();
    assert.equal(status.recording, true);
    assert.deepEqual(status.lastSaved, { file: saved.file, count: 3, at: status.lastSaved.at });
  } finally {
    stopRecording();
  }
});

test('observe.save is ignored for unknown events and empty sessions', async () => {
  stopRecording();
  assert.equal(await handleBridgeEvent({ method: 'observe.save', params: { count: 0 } }), null);
  assert.equal(recordingStatus().recording, false);
});
