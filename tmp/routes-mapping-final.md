# Ruta Backend → Functions Mapping
Generated at: 2026-04-18T16:27:18.329Z

## Summary
- Backend route files: 32
- Functions top-level entries (report): 11

## Mapping
Backend file | Token | Functions mapping | Exists | Note
--- | --- | --- | --- | ---
backend\src\routes\admin.accounts.routes.ts | admin.accounts | functions\api\admin\accounts.js | yes | direct match from report
backend\src\routes\admin.approvals.routes.ts | admin.approvals | functions\api\admin\approvals.js | yes | direct match from report
backend\src\routes\admin.auth.routes.ts | admin.auth | functions\api\admin\auth | no | no match; suggested path
backend\src\routes\admin.routes.test.ts | admin.routes.test | functions\api\admin\routes\test | no | no match; suggested path
backend\src\routes\admin.routes.ts | admin | functions\api\admin | no | no match; suggested path
backend\src\routes\admin.stores.routes.ts | admin.stores | functions\api\admin\stores.js | yes | direct match from report
backend\src\routes\admin.thresholds.routes.ts | admin.thresholds | functions\api\admin\thresholds | no | no match; suggested path
backend\src\routes\card.routes.ts | card | functions\api\card | no | no match; suggested path
backend\src\routes\cart.routes.ts | cart | functions\api\cart | no | no match; suggested path
backend\src\routes\cashSessions.routes.ts | cashSessions | functions\api\cash-sessions\index.js | yes | direct match from report
backend\src\routes\edition.routes.ts | edition | functions\api\editions\index.js | yes | direct match from report
backend\src\routes\erp.routes.ts | erp | functions\api\erp | no | no match; suggested path
backend\src\routes\external.routes.ts | external | functions\api\external | no | no match; suggested path
backend\src\routes\health.routes.ts | health | functions\api\health.js | yes | direct match from report
backend\src\routes\inventory.routes.integration.test.ts | inventory.routes.integration.test | functions\api\inventory\routes\integration\test | no | no match; suggested path
backend\src\routes\inventory.routes.ts | inventory | functions\api\inventory | no | no match; suggested path
backend\src\routes\invoices.routes.ts | invoices | functions\api\invoices\index.js | yes | direct match from report
backend\src\routes\listing.routes.ts | listing | functions\api\listings\index.js | yes | direct match from report
backend\src\routes\metrics.routes.ts | metrics | functions\api\metrics\index.js | yes | direct match from report
backend\src\routes\orders.routes.test.ts | orders.routes.test | functions\api\orders\routes\test | no | no match; suggested path
backend\src\routes\orders.routes.ts | orders | functions\api\orders\index.js | yes | direct match from report
backend\src\routes\payments.routes.ts | payments | functions\api\payments | no | no match; suggested path
backend\src\routes\payments.webhook.test.ts | payments.webhook.test | functions\api\payments\webhook\test | no | no match; suggested path
backend\src\routes\pos.cash.routes.ts | pos.cash | functions\api\pos\cash | no | no match; suggested path
backend\src\routes\pos.routes.integration.test.ts | pos.routes.integration.test | functions\api\pos\routes\integration\test | no | no match; suggested path
backend\src\routes\pos.routes.ts | pos | functions\api\pos | no | no match; suggested path
backend\src\routes\pricing.routes.ts | pricing | functions\api\pricing | no | no match; suggested path
backend\src\routes\public.routes.ts | public | functions\tienda\[slug]\catalogo.js | yes | heuristic match
backend\src\routes\public_and_import_with_mapping.integration.test.ts | public_and_import_with_mapping.integration.test | functions\api\public-and-import-with-mapping\integration\test | no | no match; suggested path
backend\src\routes\routes.integration.test.ts | routes.integration.test | functions\api\routes\integration\test | no | no match; suggested path
backend\src\routes\StripeWebhook.test.ts | StripeWebhook.test | functions\api\stripe-webhook\test | no | no match; suggested path
backend\src\routes\tcg.routes.ts | tcg | functions\api\tcgs\index.js | yes | direct match from report