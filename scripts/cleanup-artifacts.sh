#!/usr/bin/env bash
set -euo pipefail

# Safe helper to remove committed build artifacts and update .gitignore
# Usage: run from repo root. This will create a branch and commit the cleanup.

BRANCH=${1:-repo-cleanup/remove-artifacts}

echo "Creating branch: $BRANCH"
git checkout -b "$BRANCH"

echo "Removing tracked frontend/dist and backend/dist and node_modules from the index (if present)" 
git rm -r --cached frontend/dist backend/dist node_modules || true

echo "Removing files from disk (local)" 
rm -rf frontend/dist backend/dist node_modules

echo "Ensuring .gitignore has entries (frontend/dist, backend/dist, node_modules)"
grep -q "frontend/dist" .gitignore || echo "frontend/dist" >> .gitignore
grep -q "backend/dist" .gitignore || echo "backend/dist" >> .gitignore
grep -q "node_modules" .gitignore || echo "node_modules" >> .gitignore

git add .gitignore || true
git commit -m "chore(cleanup): remove committed build artifacts and ignore them" || true

echo "Cleanup committed. Review the branch and push when ready:"
echo "  git push -u origin $BRANCH"
