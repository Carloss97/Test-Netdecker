# PASS 6 - Hardening Checklist (Retro Integrity + Closure)

**Scope**: retroactive integrity review across Pass 3, Pass 4, Pass 5.
**Goal**: close what is still missing, correct what was marked done prematurely, and align docs with real implementation state.

## Item 1 (mandatory first item): #P6-001 Retroactive Integrity Sweep (Pass 3 -> Pass 5)

### Findings from exhaustive retro review

1. **P5-002 marked done, but UI still exposes global-only actions to scoped ADMIN sessions.**
   - Evidence: `canManageAdminActions` currently checks only role (`ADMIN`) in frontend dashboard.
   - Evidence: backend already enforces global-only for sensitive routes (`/api/admin/pricing-config`, `/api/admin/catalog/reset`).
   - Impact: UX mismatch (frontend advertises actions that backend rejects).
   - Status: **OPEN**.

2. **Pass 5 docs are internally inconsistent for completion status.**
   - Evidence: executive summary states P5-003 completed.
   - Evidence: checklist Sprint 2/4/5 still has unchecked items.
   - Impact: progress reporting cannot be trusted for release readiness.
   - Status: **OPEN**.

3. **P3-011 "70%+ coverage" is marked done, but there is no explicit coverage gate/script in backend/root scripts.**
   - Evidence: backend scripts include test/type-check but no coverage command.
   - Evidence: frontend pass 4 summary documents 66.15% frontend coverage (below 70%).
   - Impact: completion criterion is not enforced and likely regressed.
   - Status: **OPEN**.

4. **P3-005 (secrets management) section is not fully trackable in checklist structure.**
   - Evidence: section is present, but acceptance checklist lines for completion tracking are missing/incomplete.
   - Impact: cannot reliably audit completion from checklist itself.
   - Status: **OPEN**.

5. **Phase C error/audit hygiene had two concrete gaps; both fixed in this cycle.**
   - Gap A (fixed): invalid manual pricing-config input used ad-hoc 400 payload instead of normalized error flow.
   - Gap B (fixed): manual stock patch did not attach actor context for audit-friendly change attribution.
   - Status: **CLOSED IN PASS 6 BOOTSTRAP**.

### Acceptance criteria

- [ ] Frontend hides global-only actions when session is scoped to a tenant/store.
- [ ] Pass 5 executive summary and checklist are reconciled to one truthful status model.
- [ ] Coverage criterion is executable (script + threshold + repeatable command evidence).
- [ ] P3-005 checklist structure is normalized so completion can be audited.
- [x] Pricing-config validation errors use normalized backend error flow.
- [x] Stock update route forwards actor context for audit attribution.

### Verification log

- [x] Backend tests (targeted): `npm --prefix backend exec -- tsx --test backend/src/routes/admin.routes.test.ts backend/src/routes/multi-tenant-parity.contract.test.ts`
- [x] Backend type-check: `npm --prefix backend run type-check`

## #P6-002 UI capability gating parity for scoped admins

- [ ] Replace role-only gating in AdminDashboard with capability derived from session scope + role.
- [ ] Add regression test: scoped ADMIN cannot see global-only actions.

## #P6-003 Documentation truth reconciliation (Pass 5)

- [ ] Align PASS_5_EXECUTIVE_SUMMARY.md with PASS_5_HARDENING_CHECKLIST.md.
- [ ] Mark unresolved items explicitly as carry-over to Pass 6.

## #P6-004 Coverage enforceability

- [ ] Add backend coverage command and threshold verification.
- [ ] Add frontend coverage command and threshold verification.
- [ ] Add CI or documented local gate command for "ready to merge".

## #P6-005 Checklist structural normalization

- [ ] Normalize P3-005 acceptance criteria format to explicit checkbox items.
- [ ] Attach evidence references for each criterion.
