// Tests for ai-toolkit.schema.json <-> ai-toolkit.config.json consistency.
//
// Regression test for Issue 2 (missing JSON schema). The contract under
// test is "schema and config are mutually consistent and well-formed":
//   - the schema file is valid JSON with the expected top-level structure;
//   - the config file is valid JSON and exposes the required fields with
//     the correct primitive types;
//   - each entry under `tools` is an object with `enabled: boolean`;
//   - `default_tools` contains only strings from {opencode, claude-code}.
//
// Inline-validated (no `ajv` dep) — the project stdlib is intentionally
// minimal and adding a validator library for one structural assertion
// is over-engineering.
//
// Aspirational fields (e.g. `install.strategy`, `install.backup_existing`)
// are intentionally NOT asserted absent here; those regressions live in
// the config-vs-implementation commit.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

const schemaPath = resolve(repoRoot, 'ai-toolkit.schema.json');
const configPath = resolve(repoRoot, 'ai-toolkit.config.json');

const SUPPORTED_TOOLS = Object.freeze(['opencode', 'claude-code']);

test('schema and config are mutually consistent and well-formed', () => {
  // ── Schema: parseable, identifies itself, locks tool set ──
  const schemaRaw = readFileSync(schemaPath, 'utf8');
  const schema = JSON.parse(schemaRaw); // throws on malformed JSON
  assert.equal(typeof schema, 'object');
  assert.ok(schema !== null);
  assert.equal(typeof schema.$schema, 'string');
  assert.ok(schema.$schema.length > 0, 'schema must declare $schema');
  assert.equal(typeof schema.$id, 'string');
  assert.ok(schema.$id.length > 0, 'schema must declare $id');
  assert.equal(
    schema.properties.tools.additionalProperties, false,
    'tools.additionalProperties must be false to lock the tool set'
  );
  assert.deepEqual(
    Object.keys(schema.properties.tools.properties).sort(),
    [...SUPPORTED_TOOLS].sort(),
    'tools.properties must expose exactly opencode and claude-code'
  );

  // ── Config: parseable, required fields with right types ──
  const configRaw = readFileSync(configPath, 'utf8');
  const config = JSON.parse(configRaw); // throws on malformed JSON
  assert.equal(typeof config, 'object');
  assert.ok(config !== null);
  assert.equal(typeof config.version, 'string', 'config.version must be string');
  assert.equal(typeof config.source, 'string', 'config.source must be string');
  assert.equal(typeof config.tools, 'object', 'config.tools must be object');
  assert.ok(config.tools !== null && !Array.isArray(config.tools),
    'config.tools must be a plain object (not array, not null)');
  assert.ok(Array.isArray(config.default_tools), 'config.default_tools must be array');

  // ── tools.*: each is an object with enabled: boolean ──
  for (const [name, toolConfig] of Object.entries(config.tools)) {
    assert.equal(typeof toolConfig, 'object', `tools.${name} must be object`);
    assert.ok(toolConfig !== null && !Array.isArray(toolConfig),
      `tools.${name} must be a plain object`);
    assert.equal(typeof toolConfig.enabled, 'boolean',
      `tools.${name}.enabled must be boolean`);
  }

  // ── default_tools: only supported tool names ──
  for (const tool of config.default_tools) {
    assert.equal(typeof tool, 'string',
      `default_tools entry ${JSON.stringify(tool)} must be string`);
    assert.ok(SUPPORTED_TOOLS.includes(tool),
      `default_tools contains unsupported tool ${JSON.stringify(tool)}; ` +
      `supported: ${SUPPORTED_TOOLS.join(', ')}`);
  }
});
