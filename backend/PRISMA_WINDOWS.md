Prisma client generation on Windows (OneDrive) — Troubleshooting
---------------------------------------------------------------

Problem
-------
On Windows when the repository is located on OneDrive (or another synced folder), `prisma generate` can fail with an `EPERM` rename error while writing the query engine binary (e.g. `query_engine-windows.dll.node.tmp` → `query_engine-windows.dll.node`). This is caused by the file being locked by the sync client or Windows locking behavior.

Workarounds
-----------
- Preferred: Run `prisma generate` from WSL (Windows Subsystem for Linux) or from a directory outside OneDrive. Example:

  - Move the repo to `C:\repos\Test-Netdecker` (non-OneDrive) and run `npm --prefix backend run prisma:generate`.
  - Or open WSL, `cd /mnt/c/Users/you/Projects/Test-Netdecker/backend` and run `npm run prisma:generate` there.

- Short-term: retry after removing `.tmp` files created by Prisma. From PowerShell (run as your user):

  ```powershell
  Remove-Item -Force backend\node_modules\@prisma\client*\query_engine-windows.dll.node.tmp* -ErrorAction SilentlyContinue
  npm --prefix backend run prisma:generate
  ```

- Use the provided safe helper that logs the error but does not fail the process (added as `npm --prefix backend run prisma:generate:safe`). This is useful for CI or quick local runs where failing the entire build is undesirable.

Notes and recommendations
-------------------------
- Prefer generating the client in CI (Linux) where the EPERM issue is not present. For local development on Windows, WSL provides the most stable environment.
- If you frequently edit schema and need to regenerate, consider disabling OneDrive syncing for the project folder.
- If problems persist, try removing `node_modules/@prisma` and reinstalling, then run `prisma generate` again from WSL or outside OneDrive.

References
----------
- Prisma issue tracker and docs: https://github.com/prisma/prisma
