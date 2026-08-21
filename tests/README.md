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
and compares to a snapshot. `tests/` runs with `node --test` (Node 20+
built-in test runner, no extra deps).

Status: planned (Phase 1).
