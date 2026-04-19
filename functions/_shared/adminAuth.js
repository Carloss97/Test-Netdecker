import { pickDb, ensureSchema } from './d1.js';

function nowIso() { return new Date().toISOString(); }

function hex(buf) {
  if (!buf) return '';
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(buf)) return buf.toString('hex');
  // fallback for Uint8Array
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function pbkdf2Hash(password, saltHex, iterations = 100000, keyLen = 64) {
  try {
    const enc = new TextEncoder();
    const passKey = enc.encode(password);
    const salt = Uint8Array.from(saltHex.match(/.{1,2}/g).map(h => parseInt(h, 16)));
    const key = await (globalThis.crypto.subtle || globalThis.crypto.webkitSubtle).importKey('raw', passKey, { name: 'PBKDF2' }, false, ['deriveBits']);
    const derived = await (globalThis.crypto.subtle || globalThis.crypto.webkitSubtle).deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, keyLen * 8);
    return hex(new Uint8Array(derived));
  } catch (err) {
    return null;
  }
}

async function hashPassword(password) {
  // Prefer Node's scrypt when available for compatibility with backend
  try {
    const nodeCrypto = await import('crypto').then(m => m.default || m).catch(() => null);
    if (nodeCrypto && nodeCrypto.scryptSync) {
      const salt = nodeCrypto.randomBytes(16).toString('hex');
      const derived = nodeCrypto.scryptSync(password, salt, 64);
      return { salt, hash: `${salt}:${derived.toString('hex')}`, method: 'scrypt' };
    }
  } catch (_) {}

  // Fallback to PBKDF2
  try {
    const saltBuf = (globalThis.crypto && globalThis.crypto.getRandomValues) ? globalThis.crypto.getRandomValues(new Uint8Array(16)) : new Uint8Array(16);
    const saltHex = hex(saltBuf);
    const derivedHex = await pbkdf2Hash(password, saltHex, 100000, 64);
    if (!derivedHex) return { salt: saltHex, hash: `${['pbkdf2', 100000, saltHex, derivedHex].join(':')}`, method: 'pbkdf2' };
    return { salt: saltHex, hash: `${['pbkdf2', 100000, saltHex, derivedHex].join(':')}`, method: 'pbkdf2' };
  } catch (err) {
    // Last resort: store plain (not recommended)
    return { salt: null, hash: password, method: 'plain' };
  }
}

function constantTimeEqual(a, b) {
  try {
    if (!a || !b) return false;
    // Try Node's timingSafeEqual
    try {
      const nodeCrypto = require && require('crypto');
      if (nodeCrypto && nodeCrypto.timingSafeEqual) {
        const A = Buffer.from(a, 'hex');
        const B = Buffer.from(b, 'hex');
        if (A.length !== B.length) return false;
        return nodeCrypto.timingSafeEqual(A, B);
      }
    } catch (_) {}
    // JS fallback
    if (a.length !== b.length) return false;
    let res = 0;
    for (let i = 0; i < a.length; i++) res |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return res === 0;
  } catch (_) { return false; }
}

async function verifyPassword(password, stored) {
  if (!stored) return false;
  try {
    // pbkdf2:iterations:salt:hex
    if (String(stored).startsWith('pbkdf2:')) {
      const parts = String(stored).split(':');
      if (parts.length !== 4) return false;
      const iterations = Number(parts[1]) || 100000;
      const saltHex = parts[2];
      const expected = parts[3];
      const derived = await pbkdf2Hash(password, saltHex, iterations, expected.length / 2);
      if (!derived) return false;
      return constantTimeEqual(derived, expected);
    }

    // scrypt-style salt:hex (backend default) - try Node's scryptSync when available
    if (String(stored).includes(':')) {
      const parts = String(stored).split(':');
      if (parts.length !== 2) return false;
      const [salt, hashHex] = parts;
      try {
        const nodeCrypto = await import('crypto').then(m => m.default || m).catch(() => null);
        if (nodeCrypto && nodeCrypto.scryptSync && nodeCrypto.timingSafeEqual) {
          const derived = nodeCrypto.scryptSync(password, salt, 64);
          const a = Buffer.from(derived.toString('hex'), 'hex');
          const b = Buffer.from(String(hashHex), 'hex');
          if (a.length === b.length && nodeCrypto.timingSafeEqual(a, b)) return true;
        }
      } catch (_) {}
      return false;
    }

    // Plain compare fallback
    return String(stored) === String(password);
  } catch (err) {
    return false;
  }
}

export async function createUser(env, email, password, role = 'ADMIN') {
  const db = pickDb(env);
  if (!db) throw new Error('No DB available');
  await ensureSchema(db);
  const now = nowIso();
  const { salt, hash } = await hashPassword(password);
  const id = (globalThis.crypto && globalThis.crypto.randomUUID) ? globalThis.crypto.randomUUID() : `admin-${Date.now()}-${Math.floor(Math.random()*10000)}`;
  await db.prepare('INSERT INTO adminUser (id, email, passwordHash, passwordSalt, role, isActive, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, String(email), String(hash), salt || null, role || 'ADMIN', 1, now, now).run();
  return { id, email, role };
}

export async function authenticate(env, email, password, storeId = null) {
  const db = pickDb(env);
  if (!db) throw new Error('No DB available');
  await ensureSchema(db);
  const res = await db.prepare('SELECT id, email, passwordHash, role, isActive FROM adminUser WHERE email = ?').bind(String(email)).all();
  const row = Array.isArray(res?.results) ? res.results[0] : (Array.isArray(res) ? res[0] : null);
  if (!row) throw new Error('Invalid credentials');
  if (!row.isActive && row.isActive !== 1) throw new Error('Account disabled');
  const ok = await verifyPassword(password, row.passwordHash);
  if (!ok) throw new Error('Invalid credentials');

  // create session
  const token = (globalThis.crypto && globalThis.crypto.randomUUID) ? globalThis.crypto.randomUUID() : `tkn-${Date.now()}-${Math.floor(Math.random()*10000)}`;
  const days = Number(env.ADMIN_SESSION_DAYS || 7);
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const sid = (globalThis.crypto && globalThis.crypto.randomUUID) ? globalThis.crypto.randomUUID() : `sess-${Date.now()}-${Math.floor(Math.random()*10000)}`;
  try {
    await db.prepare('INSERT INTO adminSession (id, token, userId, expiresAt, createdAt, storeId) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(sid, String(token), String(row.id || row.ID), expiresAt, nowIso(), storeId || null).run();
  } catch (e) {
    // Fall back to earlier schema without storeId
    await db.prepare('INSERT INTO adminSession (id, token, userId, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?)').bind(sid, String(token), String(row.id || row.ID), expiresAt, nowIso()).run();
  }
  // update lastLoginAt
  await db.prepare('UPDATE adminUser SET lastLoginAt = ?, updatedAt = ? WHERE id = ?').bind(nowIso(), nowIso(), String(row.id || row.ID)).run();
  return { token, user: { id: row.id || row.ID, email: row.email || row.EMAIL, role: row.role || row.ROLE, storeId: storeId || null }, expiresAt };
}

export async function validateToken(env, token) {
  const db = pickDb(env);
  if (!db) return null;
  await ensureSchema(db);
  const res = await db.prepare('SELECT s.token, s.expiresAt, s.storeId, u.id as userId, u.email, u.role, u.isActive FROM adminSession s LEFT JOIN adminUser u ON u.id = s.userId WHERE s.token = ?').bind(String(token)).all();
  const row = Array.isArray(res?.results) ? res.results[0] : (Array.isArray(res) ? res[0] : null);
  if (!row) return null;
  if (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) return null;
  if (!row.isActive && row.isActive !== 1) return null;
  return { id: row.userId, email: row.email, role: row.role, storeId: row.storeId || null };
}

export async function logout(env, token) {
  const db = pickDb(env);
  if (!db) return;
  await ensureSchema(db);
  try {
    await db.prepare('DELETE FROM adminSession WHERE token = ?').bind(String(token)).run();
  } catch (_) {}
}

export default { createUser, authenticate, validateToken, logout };
