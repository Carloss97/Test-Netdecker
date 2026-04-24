import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { login } from '../services/adminAuth';
import apiClient from '../services/api';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [storeId, setStoreId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Intentionally do not fetch stores here (admin list is protected). Allow manual storeId input.

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const resp = await login(email.trim(), password, storeId || undefined);
      if (resp && resp.success && resp.data && resp.data.token) {
        try {
          localStorage.setItem('auth_token', resp.data.token);
        } catch (err) {
          // Storage may be blocked by browser; continue without persisting
          // eslint-disable-next-line no-console
          console.warn('[AdminLogin] localStorage.setItem blocked', err);
        }

        try {
          document.cookie = `auth_token_js=${encodeURIComponent(resp.data.token)}; Path=/; SameSite=Lax`;
        } catch (err) {
          // ignore cookie persistence failures
        }

        // Ensure apiClient uses the token for subsequent requests even if storage is blocked
        try {
          apiClient.defaults.headers.common.Authorization = `Bearer ${resp.data.token}`;
        } catch (err) {
          // ignore
        }

        try {
          const sessionStoreId = resp.data.user?.storeId ? String(resp.data.user.storeId) : null;
          const chosenStoreId = storeId ? String(storeId).trim() : '';
          if (sessionStoreId) {
            localStorage.setItem('auth_store', sessionStoreId);
          } else if (chosenStoreId) {
            localStorage.setItem('auth_store', chosenStoreId);
          } else {
            try { localStorage.removeItem('auth_store'); } catch (_) { /* ignore */ }
          }
        } catch (err) {
          // ignore storage errors for store id
        }

        const next = searchParams.get('next');
        navigate(next && next.startsWith('/') ? next : '/admin');
        return;
      }
      setError('Credenciales inválidas');
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 520, margin: '20px auto' }}>
      <h2>Admin Login</h2>
      <form onSubmit={submit}>
        <div style={{ marginBottom: 8 }}>
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>Store ID (optional)</label>
          <input type="text" value={storeId || ''} onChange={(e) => setStoreId(e.target.value || null)} placeholder="store id (optional)" />
        </div>
        {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
        <div>
          <button type="submit" disabled={loading}>{loading ? 'Entrando…' : 'Entrar'}</button>
        </div>
      </form>
    </div>
  );
}
