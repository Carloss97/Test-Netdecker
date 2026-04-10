import React, { useEffect, useState } from 'react'
import { getAccounts, createAccount } from '../services/adminAccounts'
import type { AccountType } from '../services/adminAccounts'

export function AdminAccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('ASSET')
  const [desc, setDesc] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await getAccounts()
      setAccounts(res || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    try {
      const acc = await createAccount({ code: code.trim(), name: name.trim(), type, description: desc.trim() })
      setMessage('Cuenta creada')
      setCode('')
      setName('')
      setDesc('')
      load()
    } catch (err: any) {
      setMessage(err?.message || 'Error creando cuenta')
    }
  }

  return (
    <div>
      <h1>Administrar Cuentas</h1>

      <section style={{ marginBottom: 16 }}>
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input placeholder="Código" value={code} onChange={e => setCode(e.target.value)} required />
          <input placeholder="Nombre" value={name} onChange={e => setName(e.target.value)} required />
          <select value={type} onChange={e => setType(e.target.value as AccountType)}>
            <option value="ASSET">ASSET</option>
            <option value="LIABILITY">LIABILITY</option>
            <option value="EQUITY">EQUITY</option>
            <option value="REVENUE">REVENUE</option>
            <option value="EXPENSE">EXPENSE</option>
          </select>
          <input placeholder="Descripción" value={desc} onChange={e => setDesc(e.target.value)} />
          <button type="submit">Crear</button>
        </form>
        {message && <div style={{ marginTop: 8 }}>{message}</div>}
      </section>

      <section>
        <h2>Listado de cuentas</h2>
        {loading ? <div>Cargando...</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th>Código</th>
                <th>Nombre</th>
                <th>Tipo</th>
                <th>Descripción</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a: any) => (
                <tr key={a.id}>
                  <td>{a.code}</td>
                  <td>{a.name}</td>
                  <td>{a.type}</td>
                  <td>{a.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

export default AdminAccountsPage
