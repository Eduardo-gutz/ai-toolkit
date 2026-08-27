#!/usr/bin/env bash
# scripts/test-installer.sh — End-to-end demo of the installer
# Usage: bash scripts/test-installer.sh [target_dir]
#   target_dir: defaults to /tmp/ai-toolkit-demo

set -euo pipefail

TOOLKIT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${1:-/tmp/ai-toolkit-demo}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

section() {
  echo -e "\n${BLUE}═══ $1 ═══${NC}"
}

success() {
  echo -e "${GREEN}✓${NC} $1"
}

info() {
  echo -e "${YELLOW}→${NC} $1"
}

# ─── Setup ────────────────────────────────────────────────────────────────
section "Setup: clean target directory"
rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR"
cd "$TARGET_DIR"
success "Target directory: $TARGET_DIR"

# ─── Step 1: Doctor ───────────────────────────────────────────────────────
section "Step 1: ai-toolkit doctor (pre-install)"
info "Running doctor to check the environment..."
node "$TOOLKIT_ROOT/bin/ai-toolkit.mjs" doctor --project="$TARGET_DIR" 2>&1 | head -10

# ─── Step 2: Init ─────────────────────────────────────────────────────────
section "Step 2: ai-toolkit init (first install)"
info "Installing all 4 agents + 3 skills to both tools (opencode + claude-code)..."
node "$TOOLKIT_ROOT/bin/ai-toolkit.mjs" init --tools=opencode,claude-code --project="$TARGET_DIR" --yes 2>&1 | grep -v "^$"

# ─── Step 3: List ──────────────────────────────────────────────────────────
section "Step 3: ai-toolkit list (verify what was installed)"
node "$TOOLKIT_ROOT/bin/ai-toolkit.mjs" list --project="$TARGET_DIR" 2>&1

# ─── Step 4: Validate ────────────────────────────────────────────────────
section "Step 4: ai-toolkit validate (source integrity)"
node "$TOOLKIT_ROOT/bin/ai-toolkit.mjs" validate --project="$TARGET_DIR" 2>&1 | tail -10

# ─── Step 5: Inspect installed files ──────────────────────────────────────
section "Step 5: file tree in target"
info "opencode writes here:"
find "$TARGET_DIR/.opencode" -type l 2>/dev/null | head -10
info "claude-code writes here:"
find "$TARGET_DIR/.claude" -type l 2>/dev/null | head -10
info "Rules file:"
ls -la "$TARGET_DIR/AGENTS.md" "$TARGET_DIR/CLAUDE.md" 2>/dev/null

# ─── Step 6: Add a resource ───────────────────────────────────────────────
section "Step 6: ai-toolkit add (individual resource)"
info "Adding task-planner agent (already exists, sync handles it)..."
node "$TOOLKIT_ROOT/bin/ai-toolkit.mjs" add agents task-planner --tools=opencode --project="$TARGET_DIR" 2>&1 | grep -v "^$" | head -5

# ─── Step 7: Remove a resource ────────────────────────────────────────────
section "Step 7: ai-toolkit remove (individual resource)"
info "Removing intake agent from opencode only..."
node "$TOOLKIT_ROOT/bin/ai-toolkit.mjs" remove agents intake --tools=opencode --project="$TARGET_DIR" 2>&1 | grep -v "^$" | head -3
echo ""
info "Verifying removal (opencode should NOT have intake; claude-code SHOULD):"
node "$TOOLKIT_ROOT/bin/ai-toolkit.mjs" list --tools=opencode --project="$TARGET_DIR" 2>&1 | grep -A 1 "\[opencode\]"
echo ""
node "$TOOLKIT_ROOT/bin/ai-toolkit.mjs" list --tools=claude-code --project="$TARGET_DIR" 2>&1 | grep -A 1 "\[claude-code\]"

# ─── Step 8: Sync (idempotent re-install) ────────────────────────────────
section "Step 8: ai-toolkit sync (idempotent)"
info "Running sync to re-install everything..."
node "$TOOLKIT_ROOT/bin/ai-toolkit.mjs" sync --tools=opencode,claude-code --project="$TARGET_DIR" 2>&1 | grep -v "^$" | head -5

# ─── Step 9: Doctor (post-install) ───────────────────────────────────────
section "Step 9: ai-toolkit doctor (post-install)"
node "$TOOLKIT_ROOT/bin/ai-toolkit.mjs" doctor --project="$TARGET_DIR" 2>&1 | head -10

# ─── Summary ─────────────────────────────────────────────────────────────
section "Summary"
echo "Total files in target: $(find -L "$TARGET_DIR" -type f 2>/dev/null | wc -l | xargs)"
echo "Total symlinks: $(find "$TARGET_DIR" -type l 2>/dev/null | wc -l | xargs)"
echo "State file:"
cat "$TARGET_DIR/.ai-toolkit.json" | head -20
echo ""
success "Demo complete! Inspect $TARGET_DIR to see the results."