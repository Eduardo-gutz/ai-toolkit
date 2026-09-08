import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFlags } from '../bin/lib/parse-flags.mjs';

// ─── Happy path ─────────────────────────────────────────────

test('parseFlags: --tools=opencode', () => {
  const r = parseFlags(['--tools=opencode']);
  assert.equal(r.flags.tools, 'opencode');
  assert.deepEqual(r.positional, []);
});

test('parseFlags: --tools with space-separated value', () => {
  const r = parseFlags(['--tools', 'opencode']);
  assert.equal(r.flags.tools, 'opencode');
});

test('parseFlags: multi-flag with mixed forms', () => {
  const r = parseFlags(['--tools=opencode,claude-code', '--project=/tmp/p', '--yes']);
  assert.equal(r.flags.tools, 'opencode,claude-code');
  assert.equal(r.flags.project, '/tmp/p');
  // --yes is a boolean flag (Fase 0.5 R1), so value-less = true.
  assert.equal(r.flags.yes, true);
  assert.deepEqual(r.positional, []);
});

test('parseFlags: positional args collected separately', () => {
  const r = parseFlags(['agents', 'coder', '--verbose']);
  assert.equal(r.flags.verbose, false);
  assert.deepEqual(r.positional, ['agents', 'coder']);
});

// ─── REGRESSION: --tools without value must NOT crash ─────

test('parseFlags: --tools alone returns false (was `true`, caused TypeError on .split)', () => {
  const r = parseFlags(['--tools']);
  // The previous implementation set this to `true`, which crashed any
  // caller doing `flags.tools.split(',')`.
  assert.notEqual(r.flags.tools, true, 'must not be `true` — `flags.tools.split is not a function`');
  assert.equal(r.flags.tools, false);
  assert.equal(typeof r.flags.tools, 'boolean');
});

test('parseFlags: --flag=value where value contains "=" is preserved', () => {
  const r = parseFlags(['--config=path/with=equals.json']);
  assert.equal(r.flags.config, 'path/with=equals.json');
});

test('parseFlags: -- (POSIX separator) keeps everything after as positional', () => {
  const r = parseFlags(['--tools=opencode', '--', 'remove', 'skills', '../foo']);
  assert.equal(r.flags.tools, 'opencode');
  assert.deepEqual(r.positional, ['remove', 'skills', '../foo']);
});

test('parseFlags: bare leading value-less flag', () => {
  const r = parseFlags(['--help']);
  assert.equal(r.flags.help, false);
});

test('parseFlags: empty args → empty result', () => {
  const r = parseFlags([]);
  assert.deepEqual(r.flags, {});
  assert.deepEqual(r.positional, []);
});

test('parseFlags: next arg starts with -- so value-less', () => {
  const r = parseFlags(['--tools', '--yes']);
  // --tools is value-bearing (value-less = false, fall back to config).
  // --yes is boolean (value-less = true).
  assert.equal(r.flags.tools, false);
  assert.equal(r.flags.yes, true);
});

test('parseFlags: end-of-args after value-less flag', () => {
  // --yes is a boolean flag; value-less = true. (Fase 0.5 R1 regression fix.)
  const r = parseFlags(['--yes']);
  assert.equal(r.flags.yes, true);
});

// ─── Callers can detect "value-less" case ─────────────

test('parseFlags: callers can disambiguate missing-value vs provided', () => {
  const none = parseFlags([]);
  assert.equal(none.flags.tools, undefined);

  const alone = parseFlags(['--tools']);
  assert.equal(alone.flags.tools, false);

  const withVal = parseFlags(['--tools=opencode']);
  assert.equal(withVal.flags.tools, 'opencode');
});

// ─── Realistic CLI invocations ────────────────────────────

test('parseFlags: ai-toolkit sync --tools', () => {
  // The exact input that previously crashed.
  const r = parseFlags(['sync', '--tools']);
  assert.equal(r.flags.tools, false);
});

test('parseFlags: ai-toolkit remove skills ..', () => {
  // Path-traversal payload through positional — must be parsed, NOT executed.
  const r = parseFlags(['remove', 'skills', '..']);
  assert.deepEqual(r.positional, ['remove', 'skills', '..']);
  assert.deepEqual(r.flags, {});
});

// ─── REGRESSION (Fase 0.5 R1): boolean flags must be `true`, not `false` ─

test('parseFlags: --yes (value-less) is true, not false', () => {
  // Pre-Fase 0: --yes → true. Post-Fase 0 (broken): false. Post-Fase 0.5: true.
  // Restored so `ai-toolkit remove --yes` works without requiring --yes=true.
  const r = parseFlags(['--yes']);
  assert.equal(r.flags.yes, true);
  assert.notEqual(r.flags.yes, false);
});

test('parseFlags: --global (value-less) is true', () => {
  // Pre-Fase 0: --global → true. Restored in Fase 0.5.
  const r = parseFlags(['--global']);
  assert.equal(r.flags.global, true);
});

test('parseFlags: --yes=true discards value, sets to true', () => {
  const r = parseFlags(['--yes=true']);
  assert.equal(r.flags.yes, true);
});

test('parseFlags: --yes false (space) keeps "false" as positional', () => {
  // Boolean flag with --yes and a value: value is positional, not consumed.
  // `false` and `true` aren't magic here; they're treated as positional.
  const r = parseFlags(['--yes', 'false']);
  assert.equal(r.flags.yes, true);
  assert.deepEqual(r.positional, ['false']);
});

test('parseFlags: --tools alone is still false (B0.3 fix preserved)', () => {
  // --tools is a value-bearing flag, not boolean. value-less = false.
  const r = parseFlags(['--tools']);
  assert.equal(r.flags.tools, false);
});

test('parseFlags: --project alone is still false (B0.3 fix preserved)', () => {
  const r = parseFlags(['--project']);
  assert.equal(r.flags.project, false);
});

test('parseFlags: --config alone is still false', () => {
  const r = parseFlags(['--config']);
  assert.equal(r.flags.config, false);
});

test('parseFlags: --profile alone is still false', () => {
  const r = parseFlags(['--profile']);
  assert.equal(r.flags.profile, false);
});

test('parseFlags: mixed --yes (boolean) and --tools=opencode (value)', () => {
  const r = parseFlags(['--yes', '--tools=opencode']);
  assert.equal(r.flags.yes, true);
  assert.equal(r.flags.tools, 'opencode');
});
