# tests/

Golden-file tests for each adapter. Pattern:

```
tests/
├── _shared/                 # Tests for shared helpers
│   ├── frontmatter.test.mjs
│   ├── canonical-mcp.test.mjs
│   └── mcp-transform.test.mjs
│
├── adapters/
│   ├── opencode/
│   │   ├── agent.test.mjs
│   │   ├── skill.test.mjs
│   │   ├── mcp.test.mjs
│   │   └── rules.test.mjs
│   ├── opencode/__snapshots__/
│   │   ├── agent.backend-engineer.md
│   │   └── ...
│   ├── claude-code/
│   └── claude-code/__snapshots__/
│
└── fixtures/
    └── source/             # Minimal source tree used by tests
```

Each test takes a fixture, runs the adapter's render function (no I/O),
and compares to a snapshot. `tests/` runs on the Node 20+ built-in test
runner, no extra deps. Use `npm test` (or `node scripts/run-tests.mjs`):
it runs each test file in its own process, which sidesteps a known
upstream Node.js supervisor crash (nodejs/node#66164) that makes the
plain `node --test` invocation flaky.

Status: planned (Phase 1).
