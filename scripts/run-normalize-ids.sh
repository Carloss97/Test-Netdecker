#!/bin/sh
set -euo pipefail

PAGES_URL=${PAGES_URL:-}
APPLY=${1:-}

if [ -z "$PAGES_URL" ]; then
  echo "PAGES_URL not set. Export PAGES_URL=https://your-pages.pages.dev"
  exit 2
fi

ENDPOINT="$PAGES_URL/api/admin/normalize-ids"
echo "Running dry-run against $ENDPOINT"
curl -sS -X POST "$ENDPOINT" -H 'Content-Type: application/json' -d '{}' | jq .

if [ "$APPLY" = "apply" ] ; then
  echo "Applying changes (confirm=true)"
  curl -sS -X POST "$ENDPOINT" -H 'Content-Type: application/json' -d '{"confirm":true}' | jq .
else
  echo "To apply, run: PAGES_URL=$PAGES_URL ./scripts/run-normalize-ids.sh apply"
fi
