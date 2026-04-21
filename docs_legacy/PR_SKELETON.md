# PR Skeleton: Port backend routes to Cloudflare Functions

This PR will add stubs and mapping for missing backend routes so they can be ported to Cloudflare Pages Functions.

Files created as stubs:

- functions\api\admin\routes\test\index.js
- functions\api\admin\thresholds\index.js
- functions\api\card\index.js
- functions\api\inventory\routes\integration\test\index.js
- functions\api\orders\routes\test\index.js
- functions\api\payments\webhook\test\index.js
- functions\api\pos\cash\index.js
- functions\api\pos\routes\integration\test\index.js
- functions\api\public-and-import-with-mapping\integration\test\index.js
- functions\api\routes\integration\test\index.js
- functions\api\stripe-webhook\test\index.js

Next steps:
1. Implement logic in each stub, using existing functions/_shared helpers and D1-safe queries.
2. Add tests mirroring backend route tests.
3. Run local 'wrangler pages dev' + 'node scripts/pages-smoke-test.js' to validate.
