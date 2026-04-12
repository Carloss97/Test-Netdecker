import { useEffect, useState, useRef } from 'react'
import './PosPage.css'
import apiClient from '../services/api'
import * as erp from '../services/erp'
import StripeCheckout from '../components/StripeCheckout'

type CartItem = {
  id: string
  name: string
  price: number
  qty: number
  subtotal: number
}

type Card = {
  id: string
  cardName: string
  imageUrl?: string | null
  edition?: { editionCode?: string; editionName?: string }
}

type Listing = {
  id: string
  finalPrice: number
  quantity: number
  condition: string
  rarity: string
}

const OFFLINE_KEY = 'pos_offline_queue'

export function PosPage() {
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Card[]>([])
  const [listings, setListings] = useState<Listing[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [message, setMessage] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [showCardPayment, setShowCardPayment] = useState(false)
  const [offlineQueueEntries, setOfflineQueueEntries] = useState<Array<{ createdAt: string; cart: CartItem[] }>>([])
  const searchDebounce = useRef<any>(null)

  const total = cart.reduce((sum, it) => sum + it.subtotal, 0)

  async function searchCards() {
    if (!query) return setSearchResults([])
    try {
      const { data } = await apiClient.get('/cards/search', { params: { name: query, limit: 20 } })
      setSearchResults(data || [])
    } catch (err) {
      console.error(err)
      setMessage('Error buscando cartas')
    }
  }

  useEffect(() => {
    // Debounce search while typing
    if (searchDebounce.current) clearTimeout(searchDebounce.current)
    searchDebounce.current = setTimeout(() => {
      if (query) searchCards()
    }, 350)
    return () => { if (searchDebounce.current) clearTimeout(searchDebounce.current) }
  }, [query])

  async function loadListingsForCard(cardId: string) {
    try {
      const { data } = await apiClient.get(`/listings/card/${cardId}`)
      setListings(data || [])
    } catch (err) {
      console.error(err)
      setMessage('Error cargando listings')
    }
  }

  function addListingToCart(listing: Listing, label?: string) {
    const item: CartItem = { id: listing.id, name: label || `Listing ${listing.id}`, price: Math.round(listing.finalPrice || 0), qty: 1, subtotal: Math.round(listing.finalPrice || 0) }
    setCart((s) => [...s, item])
    setMessage('')
  }

  function removeItem(index: number) {
    setCart((s) => s.filter((_, i) => i !== index))
  }

  function changeQty(index: number, qty: number) {
    setCart((s) => s.map((it, i) => (i === index ? { ...it, qty, subtotal: it.price * qty } : it)))
  }

  function enqueueOfflineSale(sale: CartItem[]) {
    try {
      const raw = localStorage.getItem(OFFLINE_KEY)
      const list = raw ? JSON.parse(raw) as any[] : []
      list.push({ createdAt: new Date().toISOString(), cart: sale })
      localStorage.setItem(OFFLINE_KEY, JSON.stringify(list))
      setMessage('Venta encolada para reintento offline')
      loadOfflineQueue()
    } catch (err) {
      console.error('offline save failed', err)
      setMessage('No fue posible encolar la venta')
    }
  }

  async function processOfflineQueue() {
    try {
      const raw = localStorage.getItem(OFFLINE_KEY)
      if (!raw) return
      const list = JSON.parse(raw) as Array<{ createdAt: string; cart: CartItem[] }>
      if (!list.length) return
      const remaining: Array<{ createdAt: string; cart: CartItem[] }> = []

      for (const entry of list) {
        try {
          // Replay the whole cart as a single POS checkout
          const items = entry.cart.map((it) => ({ listingId: it.id, quantity: it.qty }))
          await erp.posCheckout({ items, paymentMethod: 'CASH' })
        } catch (err) {
          console.error('offline replay failed for entry', entry, err)
          remaining.push(entry)
        }
      }

      if (remaining.length) {
        localStorage.setItem(OFFLINE_KEY, JSON.stringify(remaining))
      } else {
        localStorage.removeItem(OFFLINE_KEY)
        setMessage('Cola offline procesada con éxito')
      }
      loadOfflineQueue()
    } catch (err) {
      console.error('processOfflineQueue error', err)
    }
  }

  function loadOfflineQueue() {
    try {
      const raw = localStorage.getItem(OFFLINE_KEY)
      const list = raw ? JSON.parse(raw) as Array<{ createdAt: string; cart: CartItem[] }> : []
      setOfflineQueueEntries(list)
    } catch (err) {
      console.error('loadOfflineQueue failed', err)
      setOfflineQueueEntries([])
    }
  }

  async function processSingleEntry(index: number) {
    try {
      const entry = offlineQueueEntries[index]
      if (!entry) return
      const items = entry.cart.map((it) => ({ listingId: it.id, quantity: it.qty }))
      await erp.posCheckout({ items, paymentMethod: 'CASH' })
      // remove processed entry
      const copy = [...offlineQueueEntries]
      copy.splice(index, 1)
      localStorage.setItem(OFFLINE_KEY, JSON.stringify(copy))
      setOfflineQueueEntries(copy)
      setMessage('Entrada procesada')
    } catch (err) {
      console.error('processSingleEntry error', err)
      setMessage('No fue posible procesar la entrada')
    }
  }

  function removeOfflineEntry(index: number) {
    const copy = [...offlineQueueEntries]
    copy.splice(index, 1)
    localStorage.setItem(OFFLINE_KEY, JSON.stringify(copy))
    setOfflineQueueEntries(copy)
  }

  useEffect(() => {
    processOfflineQueue()
  }, [])

  async function handleCheckout() {
    if (!cart.length) {
      setMessage('Carrito vacío')
      return
    }

    setIsProcessing(true)
    setMessage('Procesando venta...')

    try {
      const items = cart.map((it) => ({ listingId: it.id, quantity: it.qty }))
      await erp.posCheckout({ items, paymentMethod: 'CASH' })
      setCart([])
      setMessage('Venta registrada correctamente')
    } catch (err: any) {
      console.error('checkout error', err)
      // Network failure or server unreachable -> enqueue for offline retry
      const isNetwork = !err?.response
      if (isNetwork) {
        enqueueOfflineSale(cart)
      }
      setMessage(err?.message || 'Error al procesar la venta')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="pos-page">
      <h1>Punto de Venta (POS)</h1>

      <div className="pos-controls">
        <input aria-label="buscar" placeholder="Buscar por nombre de carta" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button onClick={searchCards}>Buscar</button>
        <div style={{ marginLeft: 12 }}>
          <strong>Cola offline:</strong> {offlineQueueEntries.length}
          <button style={{ marginLeft: 8 }} onClick={processOfflineQueue} disabled={!offlineQueueEntries.length}>Procesar cola</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
        <div style={{ flex: 1 }}>
          <h3>Resultados</h3>
          {searchResults.length === 0 && <div>Ningún resultado</div>}
          <ul>
            {searchResults.map((c) => (
              <li key={c.id} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>{c.cardName} {c.edition?.editionCode ? `(${c.edition.editionCode})` : ''}</div>
                  <div>
                    <button onClick={() => loadListingsForCard(c.id)}>Ver listings</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <h4>Listings</h4>
          {listings.length === 0 && <div>No hay listings</div>}
          <ul>
            {listings.map((l) => (
              <li key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>{l.condition} — {l.rarity} — Stock: {l.quantity}</div>
                <div>
                  <button onClick={() => addListingToCart(l, `${l.condition} ${l.rarity}`)}>Agregar</button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div style={{ width: 420 }}>
          <h3>Carrito</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th>Ítem</th>
                <th>Precio</th>
                <th>Cant</th>
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
                    <input type="number" min={1} value={it.qty} onChange={(e) => changeQty(i, Number(e.target.value) || 1)} />
                  </td>
                  <td>{it.subtotal}</td>
                  <td>
                    <button onClick={() => removeItem(i)}>Eliminar</button>
                  </td>
                </tr>
              ))}
              {cart.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center' }}>Carrito vacío</td>
                </tr>
              )}
            </tbody>
          </table>

          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 'bold' }}>Total: {total}</div>
            <div style={{ marginTop: 8 }}>
              <button className="pos-action" onClick={handleCheckout} disabled={isProcessing}>{isProcessing ? 'Procesando...' : 'Cerrar venta'}</button>
              <button style={{ marginLeft: 8 }} onClick={() => setShowCardPayment((s) => !s)} disabled={!cart.length}>{showCardPayment ? 'Ocultar pago con tarjeta' : 'Pagar con tarjeta'}</button>
            </div>
            {message && <div style={{ marginTop: 8 }}>{message}</div>}
          </div>
          {showCardPayment && (
            <div style={{ marginTop: 12 }}>
              <h4>Pagar con tarjeta</h4>
              <StripeCheckout items={cart.map((it) => ({ listingId: it.id, quantity: it.qty }))} onSuccess={() => { setCart([]); setMessage('Pago con tarjeta y orden creada'); setShowCardPayment(false); }} />
            </div>
          )}
          {offlineQueueEntries.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <h4>Cola offline (entradas)</h4>
              <ul>
                {offlineQueueEntries.map((e, i) => (
                  <li key={e.createdAt} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div>{new Date(e.createdAt).toLocaleString()} — {e.cart.length} ítems</div>
                    <div>
                      <button onClick={() => processSingleEntry(i)}>Reintentar</button>
                      <button onClick={() => removeOfflineEntry(i)} style={{ marginLeft: 8 }}>Eliminar</button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default PosPage
