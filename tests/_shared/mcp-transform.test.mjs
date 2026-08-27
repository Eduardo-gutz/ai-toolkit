import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalToOpencode, canonicalToClaudeCode } from '../../adapters/_shared/mcp-transform.mjs';

test('canonicalToOpencode: stdio → local', () => {
  const def = {
    name: 'gh',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'gh-mcp'],
    env: { TOKEN: '${env:GH_TOKEN}' },
  };
  const result = canonicalToOpencode(def);
  assert.equal(result.type, 'local');
  assert.deepEqual(result.command, ['npx', '-y', 'gh-mcp']);
  assert.deepEqual(result.environment, { TOKEN: '${GH_TOKEN}' });
  assert.equal(result.enabled, true);
});

test('canonicalToOpencode: http → remote', () => {
  const def = {
    name: 'api',
    transport: 'http',
    url: 'https://example.com/mcp',
    headers: { Auth: 'Bearer ${env:X}' },
  };
  const result = canonicalToOpencode(def);
  assert.equal(result.type, 'remote');
  assert.equal(result.url, 'https://example.com/mcp');
  assert.deepEqual(result.headers, { Auth: 'Bearer ${X}' });
});

test('canonicalToOpencode: normalizes ${env:VAR} → ${VAR}', () => {
  const def = { name: 'x', transport: 'stdio', command: 'c', env: { Y: '${env:Y}' } };
  const result = canonicalToOpencode(def);
  assert.equal(result.environment.Y, '${Y}');
});

test('canonicalToClaudeCode: stdio → stdio', () => {
  const def = {
    name: 'gh',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'gh-mcp'],
    env: { TOKEN: '${env:GH_TOKEN}' },
  };
  const result = canonicalToClaudeCode(def);
  assert.equal(result.type, 'stdio');
  assert.equal(result.command, 'npx');
  assert.deepEqual(result.args, ['-y', 'gh-mcp']);
  assert.deepEqual(result.env, { TOKEN: '${GH_TOKEN}' });
});

test('canonicalToClaudeCode: http → http', () => {
  const def = { name: 'api', transport: 'http', url: 'https://example.com', headers: { Auth: 'Bearer X' } };
  const result = canonicalToClaudeCode(def);
  assert.equal(result.type, 'http');
  assert.equal(result.url, 'https://example.com');
});

test('canonicalToClaudeCode: normalizes ${env:VAR} → ${VAR}', () => {
  const def = { name: 'x', transport: 'stdio', command: 'c', env: { Y: '${env:Y}' } };
  const result = canonicalToClaudeCode(def);
  assert.equal(result.env.Y, '${Y}');
});

test('canonicalToClaudeCode: ws → ws (no url headers,', () => {
  const def = { name: 'ws', transport: 'ws', url: 'wss://example.com' };
  const result = canonicalToClaudeCode(def);
  assert.equal(result.type, 'ws');
  assert.equal(result.url, 'wss://example.com');
});