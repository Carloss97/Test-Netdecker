import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../services/adminAuth';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [storeId, setStoreId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  // Intentionally do not fetch stores here (admin list is protected). Allow manual storeId input.

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const resp = await login(email.trim(), password, storeId || undefined);
      if (resp && resp.success && resp.data && resp.data.token) {
        localStorage.setItem('auth_token', resp.data.token);
        if (resp.data.user && resp.data.user.storeId) {
          localStorage.setItem('auth_store', String(resp.data.user.storeId));
        } else {
          localStorage.removeItem('auth_store');
        }
        navigate('/admin');
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
