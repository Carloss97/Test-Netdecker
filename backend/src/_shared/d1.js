// Compatibility shim: re-export the D1 helpers from the functions/_shared location.
// Some modules import `../../_shared/d1.js` (resolving to backend/src/_shared/d1.js)
// while the canonical implementation lives under `backend/src/functions/_shared/d1.js`.
export * from '../functions/_shared/d1.js';
