#!/bin/bash
# Script to create GitHub issues from draft files in .github/ISSUES/
# Requires GitHub CLI (`gh`) and authentication (run `gh auth login` first).
# Uncomment and run the lines you want to execute.

# Example (uncomment to run):
# gh issue create --title "Add unit tests for critical services" --body-file .github/ISSUES/0001-add-unit-tests-critical-services.md
# gh issue create --title "Add integration tests for main endpoints" --body-file .github/ISSUES/0002-add-integration-tests-main-endpoints.md
# gh issue create --title "Standardize API error format across endpoints" --body-file .github/ISSUES/0003-standardize-api-error-format.md
# gh issue create --title "Configurable partial rollback for inventory imports" --body-file .github/ISSUES/0004-configurable-partial-rollback-inventory-imports.md
# gh issue create --title "Complete CSV export for import history" --body-file .github/ISSUES/0005-complete-csv-export-import-history.md
# gh issue create --title "Configurable volatility thresholds per TCG/edition" --body-file .github/ISSUES/0006-configurable-volatility-thresholds.md
# gh issue create --title "Manual approval flow for extreme price changes" --body-file .github/ISSUES/0007-manual-approval-flow-price-changes.md
# gh issue create --title "Implement TTL for cart reservations (expire reserved stock)" --body-file .github/ISSUES/0008-ttl-cart-reservations.md
# gh issue create --title "Admin login, roles and audit logs" --body-file .github/ISSUES/0009-admin-login-roles-audit.md
# gh issue create --title "Integrate local payment gateway (Stripe or Mercado Pago)" --body-file .github/ISSUES/0010-integrate-local-payment-gateway.md

# TIP: Run this script, review the commented lines and uncomment the ones you need.
