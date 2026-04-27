import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import apiClient from '../services/api';
import StorefrontLayout from '../components/storefront/StorefrontLayout';
import './storefront_v2.css';

export default function StorefrontLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = searchParams.get('next') || '/storefront';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      const { data } = await apiClient.post('/storefront/auth/login', { email, password });
      if (data.success) {
        localStorage.setItem('customer_token', data.token);
        localStorage.setItem('customer_data', JSON.stringify(data.customer));
        navigate(next);
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <StorefrontLayout>
      <div style={{ maxWidth: 400, margin: '100px auto', padding: 40, background: 'var(--store-surface)', borderRadius: 20, boxShadow: 'var(--store-shadow)' }}>
        <h2 style={{ textAlign: 'center', marginBottom: 30, fontWeight: 900 }}>Bienvenido de nuevo</h2>
        
        {error && <div className="sf-status warn" style={{ marginBottom: 20 }}>{error}</div>}
        
        <form onSubmit={handleLogin} style={{ display: 'grid', gap: 20 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Correo Electrónico</label>
            <input 
              type="email" 
              className="input" 
              placeholder="tu@email.com" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              required
            />
          </div>
          
          <div style={{ display: 'grid', gap: 8 }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Contraseña</label>
            <input 
              type="password" 
              className="input" 
              placeholder="••••••••" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              required
            />
          </div>

          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ padding: '12px', background: 'var(--store-primary)', border: 'none', borderRadius: 8, fontWeight: 700 }}
            disabled={loading}
          >
            {loading ? 'Ingresando...' : 'Iniciar Sesión'}
          </button>
        </form>
        
        <p style={{ textAlign: 'center', marginTop: 30, fontSize: '0.9rem', color: 'var(--store-text-muted)' }}>
          ¿No tienes cuenta? <Link to="/storefront/register" style={{ color: 'var(--store-primary)', fontWeight: 700 }}>Regístrate aquí</Link>
        </p>
      </div>
    </StorefrontLayout>
  );
}
