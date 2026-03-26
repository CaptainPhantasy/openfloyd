#!/usr/bin/env bash
# Pre-commit hook: run local verification before allowing commit.
# Install: cp scripts/pre-commit.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

echo "Running pre-commit verification..."

# Type check
if ! npx tsc --noEmit 2>&1; then
  echo "❌ TypeScript type check failed. Commit aborted."
  exit 1
fi

# Lint
if ! npm run lint 2>&1; then
  echo "❌ Lint check failed. Commit aborted."
  exit 1
fi

# Tests
if ! npm test 2>&1; then
  echo "❌ Tests failed. Commit aborted."
  exit 1
fi

echo "✅ Pre-commit checks passed."
exit 0
