import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadAdapter } from '../adapters/_shared/load-adapter.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOOLKIT = resolve(__dirname, '..');

const VALID_CONFIG = {
  source: './source',
  tools: {
    opencode: { enabled: true },
    'claude-code': { enabled: true },
  },
};

const NO_OPENCODE_CONFIG = {
  source: './source',
  tools: {
    'claude-code': { enabled: true },
  },
};

// ─── Happy path ─────────────────────────────────────────────

test('loadAdapter: opencode (whitelisted)', async () => {
  const adapter = await loadAdapter('opencode', VALID_CONFIG, TOOLKIT);
  assert.ok(adapter);
  assert.equal(typeof adapter.install, 'function');
  assert.equal(typeof adapter.sync, 'function');
  assert.equal(typeof adapter.remove, 'function');
  assert.equal(typeof adapter.validate, 'function');
});

test('loadAdapter: claude-code (whitelisted)', async () => {
  const adapter = await loadAdapter('claude-code', VALID_CONFIG, TOOLKIT);
  assert.ok(adapter);
  assert.equal(typeof adapter.install, 'function');
});

// ─── SECURITY: path traversal / injection ─────────────────────

test('loadAdapter: rejects tool not in config.tools', async () => {
  await assert.rejects(
    () => loadAdapter('foobar', VALID_CONFIG, TOOLKIT),
    /not configured/i,
    'must reject tools that are not in config.tools whitelist'
  );
});

test('loadAdapter: rejects path-traversal tool name', async () => {
  // Even though config.tools doesn't contain evil, this MUST throw before
  // ever touching the filesystem. The whitelist check is the first guard.
  await assert.rejects(
    () => loadAdapter('../../../tmp/evil', VALID_CONFIG, TOOLKIT),
    /not configured/i
  );
});

test('loadAdapter: rejects absolute path as tool name', async () => {
  await assert.rejects(
    () => loadAdapter('/etc/passwd', VALID_CONFIG, TOOLKIT),
    /not configured/i
  );
});

test('loadAdapter: rejects tool that is configured but adapter file missing', async () => {
  // Whitelist passes (claude-code is in config), but adapter file doesn't exist.
  const fakeToolkit = '/tmp/this-tk-does-not-exist';
  await assert.rejects(
    () => loadAdapter('claude-code', VALID_CONFIG, fakeToolkit),
    /Adapter not found/i
  );
});

test('loadAdapter: empty config.tools → rejects any tool', async () => {
  await assert.rejects(
    () => loadAdapter('opencode', { tools: {} }, TOOLKIT),
    /not configured/i,
    'when no tools are whitelisted, no tool may load'
  );
});

test('loadAdapter: config without tools key → rejects any tool', async () => {
  await assert.rejects(
    () => loadAdapter('opencode', { source: './source' }, TOOLKIT),
    /not configured/i
  );
});

test('loadAdapter: actual adapter file exists at expected path', () => {
  // Sanity: ensure the underlying file is where we expect, so the security
  // assumption (only whitelisted tools get loaded) holds.
  const adapterPath = join(TOOLKIT, 'adapters/opencode/adapter.mjs');
  assert.ok(existsSync(adapterPath));
});
