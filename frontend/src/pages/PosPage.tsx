import React, { useEffect, useState, useRef } from 'react'
import './PosPage.css'
import apiClient from '../services/api'
import { getListingsByCard } from '../services/catalog'
import * as erp from '../services/erp'
import StripeCheckout from '../components/StripeCheckout'

type CartItem = {
  id: string
  name: string
  price: number
  qty: number
  subtotal: number
}
      {showCreateModal && (
        <div style={{ position: 'fixed', left: 0, top: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div style={{ background: '#fff', padding: 16, width: 480, maxWidth: '95%', borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Crear listing rápido</h3>
              <div>
                <button onClick={() => setShowCreateModal(false)}>Cerrar</button>
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
      {showScanner && (
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

const MpLazy = React.lazy(() => import('../components/MercadoPagoCheckout'))

export function PosPage() {
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Card[]>([])
  const [listings, setListings] = useState<Listing[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [showScanner, setShowScanner] = useState(false)
  const [scannerMessage, setScannerMessage] = useState('')
  const [message, setMessage] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [showCardPayment, setShowCardPayment] = useState(false)
  const [showMppayment, setShowMpPayment] = useState(false)
  const [offlineQueueEntries, setOfflineQueueEntries] = useState<Array<{ createdAt: string; cart: CartItem[] }>>([])
  const searchDebounce = useRef<any>(null)

  const storeId = typeof window !== 'undefined' ? (localStorage.getItem('auth_store') || null) : null;

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const scannerInputRef = useRef<HTMLInputElement | null>(null)
  const detectorRef = useRef<any>(null)
  const scanIntervalRef = useRef<number | null>(null)
  const lastScannedRef = useRef<string | null>(null)

  const total = cart.reduce((sum, it) => sum + it.subtotal, 0)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newListingForm, setNewListingForm] = useState<any>({ gtin: '', sku: '', referencePrice: 0, marginMultiplier: 1.0, quantity: 1, editionCode: '', cardId: '' })

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
      // Prefer client helper which normalizes backend wrapper ({ success, listings })
      const listingsData = await getListingsByCard(cardId)
      setListings(Array.isArray(listingsData) ? listingsData : [])
    } catch (err) {
      console.error(err)
      setMessage('Error cargando listings')
    }
  }

  function addListingToCart(listing: Listing, label?: string) {
    setCart((s) => {
      // merge duplicates: increment quantity if same listing present
      const found = s.find((it) => it.id === listing.id)
      if (found) {
        return s.map((it) => (it.id === listing.id ? { ...it, qty: it.qty + 1, subtotal: (it.qty + 1) * it.price } : it))
      }
      const item: CartItem = { id: listing.id, name: label || `Listing ${listing.id}`, price: Math.round(listing.finalPrice || 0), qty: 1, subtotal: Math.round(listing.finalPrice || 0) }
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
    window.open(`/api/listings/label?${params.toString()}`, '_blank')
  }

  async function handleScannedCode(code: string) {
    if (!code) return
    const normalized = String(code).trim()
    if (!normalized) return
    // prevent duplicate rapid scans
    if (lastScannedRef.current === normalized) return
    lastScannedRef.current = normalized
    setScannerMessage(`Escaneado: ${normalized}`)
    try {
      const { data } = await apiClient.get('/listings/gtin', { params: { gtin: normalized } })
      if (data && data.success && data.listing) {
        const l = data.listing
        const listingObj: Listing = { id: l.listingId || l.id, finalPrice: Number(l.finalPrice || 0), quantity: Number(l.quantity || 0), condition: l.condition || 'NM', rarity: l.rarity || '' }
        addListingToCart(listingObj, l.sku || l.cardName || `GTIN ${normalized}`)
        setScannerMessage('Añadido al carrito')
        return
      }
    } catch (err: any) {
      if (err?.response && err.response.status === 404) {
        // Open quick-create modal with GTIN prefilled so user can complete details
        setNewListingForm({ gtin: normalized, sku: '', referencePrice: 0, marginMultiplier: 1.0, quantity: 1, editionCode: '', cardId: '' })
        setShowCreateModal(true)
        setScannerMessage('GTIN no encontrado — complete datos para crear listing')
        return
      }
      console.error('lookup by GTIN failed', err)
    }
    setScannerMessage('No se encontró el GTIN')
  }

  async function startCameraScan() {
    setScannerMessage('Iniciando cámara...')
    try {
      if (!videoRef.current) return
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      // BarcodeDetector if available
      try {
        const formats = ['ean_13', 'ean_8', 'code_128', 'qr_code']
        // @ts-ignore
        detectorRef.current = ('BarcodeDetector' in window) ? new (window as any).BarcodeDetector({ formats }) : null
      } catch (_) {
        detectorRef.current = null
      }
      if (detectorRef.current) {
        setScannerMessage('Escaneando con cámara...')
        scanIntervalRef.current = window.setInterval(async () => {
          try {
            // @ts-ignore
            const results = await detectorRef.current.detect(videoRef.current)
            if (results && results.length) {
              const code = results[0].rawValue || results[0].displayValue
              if (code) await handleScannedCode(code)
            }
          } catch (err) {
            // ignore detection errors
          }
        }, 350)
      } else {
        setScannerMessage('Detector no disponible en este navegador. Use la entrada de teclado.')
      }
    } catch (err) {
      console.error('startCameraScan failed', err)
      setScannerMessage('No se pudo acceder a la cámara')
    }
  }

  function stopCameraScan() {
    try {
      if (scanIntervalRef.current) { window.clearInterval(scanIntervalRef.current); scanIntervalRef.current = null }
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks()
        for (const t of tracks) t.stop()
        videoRef.current.srcObject = null
      }
      detectorRef.current = null
    } catch (_) {}
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
          await erp.posCheckout({ items, paymentMethod: 'CASH', storeId })
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
      await erp.posCheckout({ items, paymentMethod: 'CASH', storeId })
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

  useEffect(() => {
    if (showScanner) startCameraScan()
    else stopCameraScan()
    return () => stopCameraScan()
  }, [showScanner])

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
      console.error('create listing failed', err)
      setMessage('Error creando listing')
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
      await erp.posCheckout({ items, paymentMethod: 'CASH', storeId })
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
        <button style={{ marginLeft: 8 }} onClick={() => setShowScanner(true)}>Escanear GTIN</button>
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
              <button style={{ marginLeft: 8 }} onClick={() => setShowCardPayment((s) => !s)} disabled={!cart.length}>{showCardPayment ? 'Ocultar pago con tarjeta' : 'Pagar con tarjeta (Stripe)'}</button>
              <button style={{ marginLeft: 8 }} onClick={() => setShowMpPayment((s) => !s)} disabled={!cart.length}>{showMppayment ? 'Ocultar Mercado Pago' : 'Pagar con Mercado Pago'}</button>
            </div>
            {message && <div style={{ marginTop: 8 }}>{message}</div>}
          </div>
          {showCardPayment && (
            <div style={{ marginTop: 12 }}>
              <h4>Pagar con tarjeta</h4>
              <StripeCheckout items={cart.map((it) => ({ listingId: it.id, quantity: it.qty }))} onSuccess={() => { setCart([]); setMessage('Pago con tarjeta y orden creada'); setShowCardPayment(false); }} storeId={storeId} />
            </div>
          )}
          {showMppayment && (
            <div style={{ marginTop: 12 }}>
              <h4>Mercado Pago</h4>
              <React.Suspense fallback={<div>Preparando Mercado Pago…</div>}>
                <MpLazy items={cart.map((it) => ({ listingId: it.id, quantity: it.qty }))} onSuccess={() => { setCart([]); setMessage('Checkout Mercado Pago iniciado'); setShowMpPayment(false); }} storeId={storeId} />
              </React.Suspense>
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
      {showScanner && (
        <div style={{ position: 'fixed', left: 0, top: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#fff', padding: 16, width: 720, maxWidth: '95%', borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Escáner de GTIN</h3>
              <div>
                <button onClick={() => { stopCameraScan(); setShowScanner(false); setScannerMessage('') }}>Cerrar</button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <div style={{ flex: 1 }}>
                <video ref={videoRef} style={{ width: '100%', background: '#000' }} playsInline muted />
                <div style={{ marginTop: 8 }}>{scannerMessage}</div>
              </div>
              <div style={{ width: 260 }}>
                <div>
                  <label>Entrada (scanner USB / teclado)</label>
                  <input ref={scannerInputRef} placeholder="Escanea aquí y presiona Enter" onKeyDown={async (e) => {
                    if (e.key === 'Enter') { const v = (e.target as HTMLInputElement).value; (e.target as HTMLInputElement).value = ''; await handleScannedCode(v) }
                  }} />
                </div>
                <div style={{ marginTop: 12 }}>
                  <button onClick={() => { if (scannerInputRef.current) scannerInputRef.current.focus() }}>Focar entrada</button>
                  <button style={{ marginLeft: 8 }} onClick={() => { setScannerMessage('') }}>Limpiar</button>
                </div>
                <div style={{ marginTop: 12 }}>
                  <strong>Último escaneo:</strong> {lastScannedRef.current || '—'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PosPage
