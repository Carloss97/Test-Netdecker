import React, { useEffect, useState } from 'react'
import { getAccounts, createAccount, updateAccount, deleteAccount } from '../services/adminAccounts'
import type { AccountType } from '../services/adminAccounts'
import { logClientError } from '../utils/observability'

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
      logClientError({
        area: 'admin-accounts-page',
        action: 'load-accounts',
        message: 'Failed loading accounting accounts',
        error: err,
      })
      setMessage('Error cargando cuentas')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    try {
      await createAccount({ code: code.trim(), name: name.trim(), type, description: desc.trim() })
      setMessage('Cuenta creada')
      setCode('')
      setName('')
      setDesc('')
      load()
    } catch (err: any) {
      setMessage(err?.message || 'Error creando cuenta')
    }
  }

  async function handleSaveEdit(id: string, updated: any) {
    try {
      await updateAccount(id, updated)
      setEditingId(null)
      load()
      setMessage('Cuenta actualizada')
    } catch (err: any) {
      setMessage(err?.message || 'Error actualizando cuenta')
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Eliminar esta cuenta? Esta acción no es reversible')) return
    try {
      await deleteAccount(id)
      load()
      setMessage('Cuenta eliminada')
    } catch (err: any) {
      setMessage(err?.message || 'Error eliminando cuenta')
    }
  }

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<{ code?: string; name?: string; type?: AccountType; description?: string; storeId?: string }>({})

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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a: any) => (
                <tr key={a.id}>
                  <td>
                    {editingId === a.id ? (
                      <input value={editValues.code ?? a.code} onChange={e => setEditValues(ev => ({ ...ev, code: e.target.value }))} />
                    ) : (
                      a.code
                    )}
                  </td>
                  <td>
                    {editingId === a.id ? (
                      <input value={editValues.name ?? a.name} onChange={e => setEditValues(ev => ({ ...ev, name: e.target.value }))} />
                    ) : (
                      a.name
                    )}
                  </td>
                  <td>
                    {editingId === a.id ? (
                      <select value={editValues.type ?? a.type} onChange={e => setEditValues(ev => ({ ...ev, type: e.target.value as AccountType }))}>
                        <option value="ASSET">ASSET</option>
                        <option value="LIABILITY">LIABILITY</option>
                        <option value="EQUITY">EQUITY</option>
                        <option value="REVENUE">REVENUE</option>
                        <option value="EXPENSE">EXPENSE</option>
                      </select>
                    ) : (
                      a.type
                    )}
                  </td>
                  <td>
                    {editingId === a.id ? (
                      <input value={editValues.description ?? a.description} onChange={e => setEditValues(ev => ({ ...ev, description: e.target.value }))} />
                    ) : (
                      a.description
                    )}
                  </td>
                  <td>
                    {editingId === a.id ? (
                      <>
                        <button onClick={() => handleSaveEdit(a.id, editValues)}>Guardar</button>
                        <button onClick={() => { setEditingId(null); setEditValues({}); }}>Cancelar</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => { setEditingId(a.id); setEditValues({ code: a.code, name: a.name, type: a.type, description: a.description, storeId: a.storeId }); }}>Editar</button>
                        <button onClick={() => handleDelete(a.id)} style={{ marginLeft: 8 }}>Eliminar</button>
                      </>
                    )}
                  </td>
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
