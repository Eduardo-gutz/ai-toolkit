import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  removeIfEmpty,
  removeJsonKeys,
  readJsonConfig,
} from '../adapters/_shared/cleanup-if-empty.mjs';

test('removeIfEmpty: deletes empty directory', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cleanup-'));
  const target = join(dir, 'empty-dir');
  await mkdir(target, { recursive: true });
  assert.ok(existsSync(target));
  const result = await removeIfEmpty(target);
  assert.equal(result, true);
  assert.ok(!existsSync(target));
  await rm(dir, { recursive: true });
});

test('removeIfEmpty: keeps non-empty directory', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cleanup-'));
  const target = join(dir, 'non-empty');
  await mkdir(target, { recursive: true });
  await writeFile(join(target, 'file.txt'), 'content');
  const result = await removeIfEmpty(target);
  assert.equal(result, false);
  assert.ok(existsSync(target));
  await rm(dir, { recursive: true });
});

test('removeIfEmpty: no-op for non-existent path', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cleanup-'));
  const result = await removeIfEmpty(join(dir, 'does-not-exist'));
  assert.equal(result, false);
  await rm(dir, { recursive: true });
});

test('removeJsonKeys: removes single key, deletes file if empty', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cleanup-'));
  const file = join(dir, 'config.json');
  await writeFile(file, JSON.stringify({ mcp: { foo: 'bar' }, other: 'keep' }));
  const deleted = await removeJsonKeys(file, 'mcp');
  assert.equal(deleted, false, 'file should not be deleted, has other key');
  const after = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(after.mcp, undefined);
  assert.equal(after.other, 'keep');
  await rm(dir, { recursive: true });
});

test('removeJsonKeys: deletes file when becomes empty', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cleanup-'));
  const file = join(dir, 'config.json');
  await writeFile(file, JSON.stringify({ mcp: { foo: 'bar' } }));
  const deleted = await removeJsonKeys(file, 'mcp');
  assert.equal(deleted, true, 'file should be deleted');
  assert.ok(!existsSync(file));
  await rm(dir, { recursive: true });
});

test('removeJsonKeys: handles array of keys', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cleanup-'));
  const file = join(dir, 'config.json');
  await writeFile(file, JSON.stringify({ a: 1, b: 2, c: 3 }));
  await removeJsonKeys(file, ['a', 'c']);
  const after = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual(after, { b: 2 });
  await rm(dir, { recursive: true });
});

test('removeJsonKeys: no-op for missing keys', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cleanup-'));
  const file = join(dir, 'config.json');
  await writeFile(file, JSON.stringify({ a: 1 }));
  const result = await removeJsonKeys(file, 'nonexistent');
  assert.equal(result, false);
  await rm(dir, { recursive: true });
});

test('readJsonConfig: returns fallback when file does not exist', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cleanup-'));
  const file = join(dir, 'does-not-exist.json');
  const result = await readJsonConfig(file, { defaultKey: true });
  assert.deepEqual(result, { defaultKey: true });
  await rm(dir, { recursive: true });
});

test('readJsonConfig: returns fallback for corrupted JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cleanup-'));
  const file = join(dir, 'broken.json');
  await writeFile(file, '{ this is not json');
  const result = await readJsonConfig(file, { fallback: true });
  assert.deepEqual(result, { fallback: true });
  await rm(dir, { recursive: true });
});

test('readJsonConfig: returns fallback when content is a JSON array', async () => {
  // typeof guard (M14): reject arrays — callers expect object shape.
  const dir = await mkdtemp(join(tmpdir(), 'cleanup-'));
  const file = join(dir, 'array.json');
  await writeFile(file, JSON.stringify([1, 2, 3]));
  const result = await readJsonConfig(file, { shape: 'object' });
  assert.deepEqual(result, { shape: 'object' });
  await rm(dir, { recursive: true });
});

test('readJsonConfig: returns fallback when content is JSON null', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cleanup-'));
  const file = join(dir, 'null.json');
  await writeFile(file, 'null');
  const result = await readJsonConfig(file, { shape: 'object' });
  assert.deepEqual(result, { shape: 'object' });
  await rm(dir, { recursive: true });
});

test('readJsonConfig: returns parsed object for valid JSON object', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cleanup-'));
  const file = join(dir, 'valid.json');
  const obj = { mcpServers: { foo: { type: 'http' } }, other: 'value' };
  await writeFile(file, JSON.stringify(obj));
  const result = await readJsonConfig(file, {});
  assert.deepEqual(result, obj);
  await rm(dir, { recursive: true });
});

test('readJsonConfig: respects custom fallback (not just empty {})', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cleanup-'));
  const file = join(dir, 'missing.json');
  const result = await readJsonConfig(file, { custom: 'fallback', count: 42 });
  assert.deepEqual(result, { custom: 'fallback', count: 42 });
  await rm(dir, { recursive: true });
});
