import { useState, useEffect, lazy, Suspense } from 'react'
import './PosPage.css'
import apiClient, { buildApiUrl } from '../services/api'
import { getListingsByCard } from '../services/catalog'
import * as erp from '../services/erp'
import StripeCheckout from '../components/StripeCheckout'
import { logClientError } from '../utils/observability'

export type CartItem = {
  id: string
  name: string
  price: number
  qty: number
  subtotal: number
}

export type Listing = {
  id: string
  finalPrice?: number
  quantity?: number
  condition?: string
  rarity?: string
  gtin?: string
  sku?: string
}

export type Card = {
  id: string
  cardName?: string
  edition?: { editionCode?: string }
}

export type NewListingForm = {
  gtin: string
  sku: string
  referencePrice: number
  marginMultiplier: number
  quantity: number
  editionCode: string
  cardId: string
  currency?: string
}

const OFFLINE_KEY = 'pos_offline_queue_v1'

export function PosPage(): JSX.Element {
  const [cart, setCart] = useState<CartItem[]>([])
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Card[]>([])
  const [listings, setListings] = useState<Listing[]>([])
  const [message, setMessage] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showCardPayment, setShowCardPayment] = useState(false)
  const [showMpPayment, setShowMpPayment] = useState(false)
  const [offlineQueueEntries, setOfflineQueueEntries] = useState<Array<{ createdAt: string; cart: CartItem[] }>>([])

  const [newListingForm, setNewListingForm] = useState<NewListingForm>({ gtin: '', sku: '', referencePrice: 0, marginMultiplier: 1.0, quantity: 1, editionCode: '', cardId: '', currency: 'CLP' })

  const MpLazy = lazy(() => import('../components/MercadoPagoCheckout'))

  const total = cart.reduce((s, it) => s + it.subtotal, 0)

  function addListingToCart(listing: Listing, label?: string) {
    setCart((s) => {
      const found = s.find((it) => it.id === listing.id)
      if (found) {
        return s.map((it) => (it.id === listing.id ? { ...it, qty: it.qty + 1, subtotal: (it.qty + 1) * it.price } : it))
      }
      const price = Math.round(listing.finalPrice || 0)
      const item: CartItem = { id: listing.id, name: label || `Listing ${listing.id}`, price, qty: 1, subtotal: price }
      return [...s, item]
    })
    setMessage('')
  }

  function openLabel(listing: any) {
    const q = listing?.gtin || listing?.id || listing?.listingId
    const id = listing?.listingId || listing?.id
    const params = new URLSearchParams()
    if (q) params.set('gtin', q)
    if (id) params.set('id', id)
    window.open(buildApiUrl(`/listings/label?${params.toString()}`), '_blank')
  }

  function removeItem(index: number) {
    setCart((s) => s.filter((_, i) => i !== index))
  }

  function changeQty(index: number, qty: number) {
    setCart((s) => s.map((it, i) => (i === index ? { ...it, qty, subtotal: it.price * qty } : it)))
  }

  function printLabelsForCart() {
    if (!cart || !cart.length) {
      setMessage('Carrito vacío')
      return
    }
    const ids = cart.map((it) => it.id).join(',')
    const qtys = cart.map((it) => it.qty).join(',')
    const url = buildApiUrl(`/listings/labels-sheet?ids=${encodeURIComponent(ids)}&qtys=${encodeURIComponent(qtys)}`)
    window.open(url, '_blank')
  }

  async function enqueueOfflineSale(sale: CartItem[]) {
    try {
      const raw = localStorage.getItem(OFFLINE_KEY)
      const list = raw ? JSON.parse(raw) : []
      list.push({ createdAt: new Date().toISOString(), cart: sale })
      localStorage.setItem(OFFLINE_KEY, JSON.stringify(list))
      setMessage('Venta encolada para reintento offline')
      setOfflineQueueEntries(list)
    } catch (err) {
      logClientError({
        area: 'pos-page',
        action: 'enqueue-offline-sale',
        message: 'Failed enqueueing offline sale',
        context: { saleCount: sale.length },
        error: err,
      })
      setMessage('No fue posible encolar la venta')
    }
  }

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
      logClientError({
        area: 'pos-page',
        action: 'checkout-pos-cash',
        message: 'POS checkout failed',
        context: {
          items: cart.map((it) => ({ listingId: it.id, quantity: it.qty })),
          cartSize: cart.length,
          total,
        },
        error: err,
      })
      const isNetwork = !err?.response
      if (isNetwork) {
        await enqueueOfflineSale(cart)
      }
      setMessage(err?.message || 'Error al procesar la venta')
    } finally {
      setIsProcessing(false)
    }
  }

  function loadOfflineQueue() {
    try {
      const raw = localStorage.getItem(OFFLINE_KEY)
      const list = raw ? JSON.parse(raw) as Array<{ createdAt: string; cart: CartItem[] }> : []
      setOfflineQueueEntries(list)
    } catch (err) {
      logClientError({
        area: 'pos-page',
        action: 'load-offline-queue',
        message: 'Failed loading offline queue',
        error: err,
      })
      setOfflineQueueEntries([])
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
          const items = entry.cart.map((it) => ({ listingId: it.id, quantity: it.qty }))
          await erp.posCheckout({ items, paymentMethod: 'CASH' })
        } catch (err) {
          logClientError({
            area: 'pos-page',
            action: 'offline-replay-entry',
            message: 'Failed replaying offline queue entry',
            context: { createdAt: entry.createdAt, itemCount: entry.cart.length },
            error: err,
          })
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
      logClientError({
        area: 'pos-page',
        action: 'process-offline-queue',
        message: 'Failed processing offline queue',
        error: err,
      })
    }
  }

  useEffect(() => {
    loadOfflineQueue()
  }, [])

  async function searchCards() {
    if (!query) return setSearchResults([])
    try {
      const { data } = await apiClient.get('/cards/search', { params: { name: query, limit: 20 } })
      setSearchResults(data || [])
    } catch (err) {
      logClientError({
        area: 'pos-page',
        action: 'search-cards',
        message: 'Failed searching cards in POS',
        context: { query },
        error: err,
      })
      setMessage('Error buscando cartas')
    }
  }

  async function loadListingsForCard(cardId: string) {
    try {
      const items = await getListingsByCard(cardId)
      setListings(items || [])
    } catch (err) {
      logClientError({
        area: 'pos-page',
        action: 'load-listings-for-card',
        message: 'Failed loading listings for POS card',
        context: { cardId },
        error: err,
      })
      setMessage('Error cargando listings')
    }
  }

  async function submitNewListing() {
    try {
      if (!newListingForm.gtin) return setMessage('GTIN requerido')
      const payload = {
        gtin: newListingForm.gtin,
        sku: newListingForm.sku || undefined,
        referencePrice: Number(newListingForm.referencePrice || 0),
        marginMultiplier: Number(newListingForm.marginMultiplier || 1.0),
        quantity: Number(newListingForm.quantity || 0),
        editionCode: newListingForm.editionCode || undefined,
        cardId: newListingForm.cardId || undefined,
        currency: newListingForm.currency || 'CLP'
      }
      const resp = await apiClient.post('/listings/gtin', payload)
      const created = resp.data?.listing
      if (created) {
        const listingObj: Listing = { id: created.listingId || created.id, finalPrice: Number(created.finalPrice || 0), quantity: Number(created.quantity || 0), condition: created.condition || 'NM', rarity: created.rarity || '' }
        addListingToCart(listingObj, created.sku || `GTIN ${created.gtin || payload.gtin}`)
        setMessage('Listing creado y añadido al carrito')
        setShowCreateModal(false)
        return
      }
      setMessage('No fue posible crear el listing')
    } catch (err) {
      logClientError({
        area: 'pos-page',
        action: 'create-listing-from-pos',
        message: 'Failed creating listing from POS',
        context: { gtin: newListingForm.gtin, cardId: newListingForm.cardId || null },
        error: err,
      })
      setMessage('Error creando listing')
    }
  }

  async function autoFillFromGTIN() {
    try {
      if (!newListingForm || !newListingForm.gtin) {
        setMessage('Ingrese GTIN para auto-llenar')
        return
      }
      setMessage('Buscando datos externos...')
      const resp = await apiClient.get('/listings/gtin-info', { params: { gtin: newListingForm.gtin } })
      const data = resp.data
      if (data?.success) {
        if (data.listing) {
          const l = data.listing
          setNewListingForm((p: any) => ({ ...p, sku: l.sku || p.sku, referencePrice: l.referencePrice ?? p.referencePrice, quantity: l.quantity ?? p.quantity, currency: l.currency || p.currency }))
          setMessage('Rellenado desde listing existente')
          return
        }
        if (data.product) {
          const p = data.product
          setNewListingForm((prev: any) => ({ ...prev, sku: `${p.brand ? p.brand + ' ' : ''}${(p.title || '').slice(0, 60)}` }))
          setMessage('Sugerencias aplicadas desde fuente externa')
          return
        }
      }
      setMessage('No se encontraron datos externos para este GTIN')
    } catch (err) {
      logClientError({
        area: 'pos-page',
        action: 'autofill-from-gtin',
        message: 'Failed auto-filling listing from GTIN',
        context: { gtin: newListingForm.gtin },
        error: err,
      })
      setMessage('Error en auto-llenado')
    }
  }

  return (
    <div className="pos-page">
      <h1>Punto de Venta (POS) — Progressive Restore</h1>
      <div>Total: {total}</div>
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
                  <button style={{ marginLeft: 8 }} onClick={() => openLabel(l)}>Imprimir etiqueta</button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div style={{ width: 420 }}>
          <h3>Carrito</h3>
          <ul>
            {cart.map((it, i) => (
              <li key={`${it.id}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div>{it.name}</div>
                <div>{it.qty} × {it.price} = {it.subtotal}</div>
                <div>
                  <button onClick={() => changeQty(i, Math.max(1, it.qty - 1))}>-</button>
                  <button onClick={() => changeQty(i, it.qty + 1)}>+</button>
                  <button onClick={() => removeItem(i)}>Eliminar</button>
                </div>
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 'bold' }}>Total: {total}</div>
            <div style={{ marginTop: 8 }}>
              <button onClick={handleCheckout} disabled={isProcessing}>{isProcessing ? 'Procesando...' : 'Cerrar venta'}</button>
              <button style={{ marginLeft: 8 }} onClick={() => setShowCardPayment((s) => !s)} disabled={!cart.length}>{showCardPayment ? 'Ocultar pago con tarjeta' : 'Pagar con tarjeta (Stripe)'}</button>
              <button style={{ marginLeft: 8 }} onClick={() => setShowMpPayment((s) => !s)} disabled={!cart.length}>{showMpPayment ? 'Ocultar Mercado Pago' : 'Pagar con Mercado Pago'}</button>
              <button style={{ marginLeft: 8 }} onClick={printLabelsForCart} disabled={!cart.length}>Imprimir etiquetas</button>
            </div>
            {message && <div style={{ marginTop: 8 }}>{message}</div>}
            {showCardPayment && (
              <div style={{ marginTop: 12 }}>
                <h4>Pagar con tarjeta</h4>
                <StripeCheckout items={cart.map((it) => ({ listingId: it.id, quantity: it.qty }))} onSuccess={() => { setCart([]); setMessage('Pago con tarjeta y orden creada'); setShowCardPayment(false); }} storeId={null} />
              </div>
            )}
            {showMpPayment && (
              <div style={{ marginTop: 12 }}>
                <h4>Mercado Pago</h4>
                <Suspense fallback={<div>Preparando Mercado Pago…</div>}>
                  <MpLazy items={cart.map((it) => ({ listingId: it.id, quantity: it.qty }))} onSuccess={() => { setCart([]); setMessage('Checkout Mercado Pago iniciado'); setShowMpPayment(false); }} storeId={null} />
                </Suspense>
              </div>
            )}
          </div>
        </div>
      </div>

      {showCreateModal && (
        <div style={{ position: 'fixed', left: 0, top: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div style={{ background: '#fff', padding: 16, width: 480, maxWidth: '95%', borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Crear listing rápido</h3>
              <div>
                <button onClick={() => setShowCreateModal(false)}>Cerrar</button>
                <button style={{ marginLeft: 8 }} onClick={autoFillFromGTIN}>Auto-llenar</button>
              </div>
            </div>
            <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
              <label>GTIN</label>
              <input value={newListingForm.gtin} onChange={(e) => setNewListingForm({ ...newListingForm, gtin: e.target.value })} />
              <label>SKU</label>
              <input value={newListingForm.sku} onChange={(e) => setNewListingForm({ ...newListingForm, sku: e.target.value })} />
              <label>Reference price (USD)</label>
              <input type="number" value={newListingForm.referencePrice} onChange={(e) => setNewListingForm({ ...newListingForm, referencePrice: Number(e.target.value || 0) })} />
              <label>Margin multiplier</label>
              <input type="number" step="0.01" value={newListingForm.marginMultiplier} onChange={(e) => setNewListingForm({ ...newListingForm, marginMultiplier: Number(e.target.value || 1.0) })} />
              <label>Quantity</label>
              <input type="number" value={newListingForm.quantity} onChange={(e) => setNewListingForm({ ...newListingForm, quantity: Number(e.target.value || 0) })} />
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <button onClick={submitNewListing}>Crear y añadir</button>
                <button onClick={() => setShowCreateModal(false)}>Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default PosPage
