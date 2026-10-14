// Unit tests of the shared helpers.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clamp, lazy } from '../src/util.js';

test('lazy runs its loader once, and again after a failure', async () => {
  let calls = 0;
  const load = lazy(async () => {
    calls++;
    if (calls === 1) throw new Error('first time');
    return 'ready';
  });
  await assert.rejects(load(), /first time/);
  assert.equal(await load(), 'ready');
  assert.equal(await load(), 'ready');
  assert.equal(calls, 2);
});

test('clamp keeps a value between its bounds', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(11, 0, 10), 10);
});
