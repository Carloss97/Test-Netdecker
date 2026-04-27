import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import apiClient from '../services/api';
import StorefrontLayout from '../components/storefront/StorefrontLayout';
import './storefront_v2.css';

export default function StorefrontRegisterPage() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    address: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      const { data } = await apiClient.post('/storefront/auth/register', form);
      if (data.success) {
        localStorage.setItem('customer_token', data.token);
        localStorage.setItem('customer_data', JSON.stringify(data.customer));
        navigate('/storefront');
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Error al crear cuenta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <StorefrontLayout>
      <div style={{ maxWidth: 500, margin: '60px auto', padding: 40, background: 'var(--store-surface)', borderRadius: 20, boxShadow: 'var(--store-shadow)' }}>
        <h2 style={{ textAlign: 'center', marginBottom: 10, fontWeight: 900 }}>Únete a la Comunidad</h2>
        <p style={{ textAlign: 'center', color: 'var(--store-text-muted)', marginBottom: 30 }}>Colecciona, juega y domina.</p>
        
        {error && <div className="sf-status warn" style={{ marginBottom: 20 }}>{error}</div>}
        
        <form onSubmit={handleRegister} style={{ display: 'grid', gap: 15 }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Nombre Completo</label>
            <input 
              className="input" 
              placeholder="Juan Perez" 
              value={form.name} 
              onChange={e => setForm({ ...form, name: e.target.value })} 
              required
            />
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Correo Electrónico</label>
            <input 
              type="email" 
              className="input" 
              placeholder="tu@email.com" 
              value={form.email} 
              onChange={e => setForm({ ...form, email: e.target.value })} 
              required
            />
          </div>
          
          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Contraseña (mín. 6 caracteres)</label>
            <input 
              type="password" 
              className="input" 
              placeholder="••••••••" 
              value={form.password} 
              onChange={e => setForm({ ...form, password: e.target.value })} 
              required
              minLength={6}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Teléfono (opcional)</label>
              <input 
                className="input" 
                placeholder="+56 9..." 
                value={form.phone} 
                onChange={e => setForm({ ...form, phone: e.target.value })} 
              />
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Dirección (opcional)</label>
              <input 
                className="input" 
                placeholder="Av. Providencia 123..." 
                value={form.address} 
                onChange={e => setForm({ ...form, address: e.target.value })} 
              />
            </div>
          </div>

          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ padding: '14px', background: 'var(--store-primary)', border: 'none', borderRadius: 8, fontWeight: 700, marginTop: 10 }}
            disabled={loading}
          >
            {loading ? 'Creando cuenta...' : 'Registrarse'}
          </button>
        </form>
        
        <p style={{ textAlign: 'center', marginTop: 30, fontSize: '0.9rem', color: 'var(--store-text-muted)' }}>
          ¿Ya tienes cuenta? <Link to="/storefront/login" style={{ color: 'var(--store-primary)', fontWeight: 700 }}>Inicia sesión</Link>
        </p>
      </div>
    </StorefrontLayout>
  );
}
