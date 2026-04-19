import React, { useState } from 'react'
import './PosPage.css'

export type CartItem = {
  id: string
  name: string
  price: number
  qty: number
  subtotal: number
}

export function PosPage(): JSX.Element {
  const [cart, setCart] = useState<CartItem[]>([])
  const total = cart.reduce((s, it) => s + it.subtotal, 0)

  function addDummy() {
    const item: CartItem = { id: `${Date.now()}`, name: 'Sample', price: 100, qty: 1, subtotal: 100 }
    setCart((c) => [...c, item])
  }

  return (
    <div className="pos-page">
      <h1>Punto de Venta (POS) - Minimal</h1>
      <div>Total: {total}</div>
      <button onClick={addDummy}>Add item</button>
      <ul>
        {cart.map((it) => (
          <li key={it.id}>{it.name} - {it.subtotal}</li>
        ))}
      </ul>
    </div>
  )
}

export default PosPage
