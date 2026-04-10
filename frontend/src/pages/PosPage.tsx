import React, { useState } from 'react'
import './PosPage.css'
import * as erp from '../services/erp'


type CartItem = {
  id: string
  name: string
  price: number
  qty: number
  subtotal: number
}

export function PosPage() {
  const [query, setQuery] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [message, setMessage] = useState('')

  function addMockItem() {
    if (!query) {
      setMessage('Ingrese un ID o término de búsqueda')
      return
    }

    const item: CartItem = {
      id: query,
      name: `Item ${query}`,
      price: 1000,
      qty: 1,
      subtotal: 1000,
    }

    setCart((s) => [...s, item])
    setQuery('')
    setMessage('')
  }

  function removeItem(index: number) {
    setCart((s) => s.filter((_, i) => i !== index))
  }

  function changeQty(index: number, qty: number) {
    setCart((s) =>
      s.map((it, i) => (i === index ? { ...it, qty, subtotal: it.price * qty } : it)),
    )
  }

  const total = cart.reduce((sum, it) => sum + it.subtotal, 0)
  const [isProcessing, setIsProcessing] = useState(false)

  async function handleCheckout() {
    if (!cart.length) {
      setMessage('Carrito vacío');
      return;
    }

    setIsProcessing(true);
    setMessage('Procesando venta...');

    try {
      // For simplicity, create & commit reservations sequentially
      for (const it of cart) {
        // assume `it.id` is listingId
        const res = await erp.createReservation({ listingId: it.id, quantity: it.qty });
        await erp.commitReservation(res.id);
      }

      setMessage('Venta registrada correctamente');
      setCart([]);
    } catch (err: any) {
      console.error(err);
      setMessage(err?.message || 'Error al procesar la venta');
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="pos-page">
      <h1>Punto de Venta (POS) — Esqueleto</h1>

      <div className="pos-controls">
        <input
          aria-label="buscar"
          placeholder="ID de listing o búsqueda"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button onClick={addMockItem}>Agregar</button>
      </div>

      <div className="pos-cart">
        <table>
          <thead>
            <tr>
              <th>Ítem</th>
              <th>Precio</th>
              <th>Cantidad</th>
              <th>Subtotal</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cart.map((it, i) => (
              <tr key={`${it.id}-${i}`}>
                <td>{it.name}</td>
                <td>{it.price}</td>
                <td>
                  <input
                    type="number"
                    min={1}
                    value={it.qty}
                    onChange={(e) => changeQty(i, Number(e.target.value) || 1)}
                  />
                </td>
                <td>{it.subtotal}</td>
                <td>
                  <button onClick={() => removeItem(i)}>Eliminar</button>
                </td>
              </tr>
            ))}
            {cart.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center' }}>
                  Carrito vacío
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pos-summary">
        <div className="pos-total">Total: {total}</div>
        <div>
          <button className="pos-action" onClick={handleCheckout} disabled={isProcessing}>
            {isProcessing ? 'Procesando...' : 'Cerrar venta'}
          </button>
        </div>
      </div>

      {message && <div className="pos-message">{message}</div>}
    </div>
  )
}

export default PosPage
