#!/usr/bin/env bash
# scripts/verify.sh — Local build verification for OPEN-FLOYD
# Run before committing or as part of pre-commit hooks.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

PASS=0
FAIL=0

section() {
  echo ""
  echo "=== $1 ==="
}

check() {
  if "$@"; then
    echo "  ✓ $1"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $1"
    FAIL=$((FAIL + 1))
  fi
}

section "TypeScript Compilation"
check "tsc --noEmit"

section "Lint"
check "npm run lint"

section "Tests"
check "npm test -- --passWithNoTests"

section "Coverage Threshold"
if npm run test:coverage 2>&1 | grep -q "not met"; then
  echo "  ✗ Coverage threshold not met"
  FAIL=$((FAIL + 1))
else
  echo "  ✓ Coverage thresholds met"
  PASS=$((PASS + 1))
fi

section "Build"
check "npm run build"

echo ""
echo "─────────────────────────"
echo "Results: $PASS passed, $FAIL failed"
echo "─────────────────────────"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
