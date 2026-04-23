# Propuesta: Tienda Moderna de Cartas TCG (Storefront)

**Objetivo**: Demostración de cómo se vería la plataforma como **tienda B2C** en producción, similar a deckscards.cl.

---

## Arquitectura de Componentes

### Flujo de Navegación

```
Homepage (Hero + Featured Cards)
    ↓
Storefront (Grid + Filters)
    ↓
Product Detail (Modal / Full Page)
    ├─ Add to Cart
    └─ View Similar Cards
    
Cart (Floating Panel or Page)
    ├ Review Items
    ├ Apply Coupon
    └─ Checkout
    
Checkout (Multi-step)
    ├ Shipping Address
    ├ Payment Method
    └─ Order Confirmation
```

---

## Página 1: Landing / Homepage

### Hero Section
```
┌─────────────────────────────────────────────────────────────┐
│                                                               │
│    The Ultimate TCG Card Store                              │
│    ✨ Magic • Pokémon • Yu-Gi-Oh • One Piece               │
│                                                               │
│    [  Search for cards...  ]                                │
│    [Browse All]  [New Arrivals]  [Hot Deals]              │
│                                                               │
│ Featured Cards Carousel 🎴                                   │
│ ◄ [Beautiful Black Lotus] [Charizard HOLO] ► Next 4 Cards  │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Featured Collections
```
┌─ Magic: The Gathering          ┬─ Pokémon TCG
│ 450 cards in stock             │ 2,100 cards in stock
│ From $0.50 to $500             │ From $1 to $300
│ Best Sellers ⭐⭐⭐⭐⭐          │ Trending Now 📈
└────────────────────────────────┴─────────────────────────────┐
│                                                               │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐             │
│  │  Yu-Gi-Oh  │  │  One Piece │  │ Digimon    │             │
│  │ 180 cards  │  │ 45 cards   │  │ 25 cards   │             │
│  └────────────┘  └────────────┘  └────────────┘             │
└──────────────────────────────────────────────────────────────┘
```

---

## Página 2: Storefront / Catálogo

### Layout
```
┌──────────────────────────────────────────────────────────────┐
│ 🏪 TCG Store / Catalog                  🛒 (3) | ♥ | Profile│
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ┌─────────────────┐  ┌──────────────────────────────────────┐  │
│ │                 │  │  Filters & Search                    │  │
│ │    FILTERS      │  │  ┌──────────────────────────────────┐│  │
│ │                 │  │  │ 🔍 Search: "Black Lotus"        ││  │
│ │ TCG:            │  │  └──────────────────────────────────┘│  │
│ │ ☑ Magic         │  │                                      │  │
│ │ ☑ Pokémon       │  │  Price Range:                       │  │
│ │ ☑ Yu-Gi-Oh      │  │  $0 ━━━━━━━━━━━ $500              │  │
│ │ ☐ One Piece     │  │                                      │  │
│ │ ☐ Digimon       │  │  Condition:                         │  │
│ │                 │  │  ☑ Mint  ☑ NM  ☑ LP  ☑ MP         │  │
│ │ Rarity:         │  │                                      │  │
│ │ ☑ Common        │  │  Set:                               │  │
│ │ ☑ Uncommon      │  │  ┌──────────────────────────────────┐│  │
│ │ ☑ Rare          │  │  │ Alpha (1993) ▼              ☒    ││  │
│ │ ☑ Mythic        │  │  └──────────────────────────────────┘│  │
│ │                 │  │                                      │  │
│ │ [Clear All]     │  │  Sorting: Most Popular ▼            │  │
│ │                 │  │                                      │  │
│ └─────────────────┘  └──────────────────────────────────────┘  │
│                                                                 │
│  📊 Results: 3,245 cards found                                 │
│  View: [⬚⬚⬚ Grid] [≡ List]                                    │
│                                                                 │
│  PRODUCT GRID:                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   🖼️  Card   │  │   🖼️  Card   │  │   🖼️  Card   │         │
│  │              │  │              │  │              │         │
│  │ Magic Art    │  │Pikachu HOLO  │  │Blue-Eyes WD  │         │
│  │ Black Lotus  │  │              │  │              │         │
│  │              │  │ Pokémon      │  │ Yu-Gi-Oh     │         │
│  │ Magic        │  │Base Set      │  │ LOB          │         │
│  │ Alpha        │  │              │  │              │         │
│  │              │  │ Condition:   │  │ Condition:   │         │
│  │ $350-$450    │  │ Mint ⭐⭐⭐   │  │ NM ⭐⭐⭐⭐    │         │
│  │              │  │              │  │              │         │
│  │ Stock: 1     │  │ Stock: 3     │  │ Stock: 5     │         │
│  │ [Add to Cart]│  │[Add to Cart] │  │[Add to Cart] │         │
│  │ [♥] Details │  │[♥] Details  │  │[♥] Details  │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   (more)     │  │   (more)     │  │   (more)     │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│                                                                 │
│  [← Previous] Page 1 of 108 [Next →]                          │
│                                                                 │
└──────────────────────────────────────────────────────────────┘
```

### Tarjeta de Producto (Grid View)

```
┌──────────────────────────┐
│ 🎴                       │  ← Imagen de la carta (hover: zoom)
│                          │
│ Magic Art                │
│ Black Lotus              │  ← Nombre
│                          │
│ Magic • Alpha • 1993     │  ← Meta info
│                          │
│ ⭐⭐⭐⭐⭐ (234 reviews)   │  ← Rating
│                          │
│ Condition: Mint          │  ← Condición
│ Stock: 1 in stock        │  ← Stock (verde si hay, rojo si no)
│                          │
│ $425.00 CLP              │  ← Precio prominente
│ (USD $0.50 reference)    │  ← Referencia de precio
│                          │
│ ┌────────────────────┐   │
│ │ Add to Cart        │   │  ← CTA principal
│ └────────────────────┘   │
│ [♥] [Compare]            │  ← Secundarias
│ [Details] [Similar]      │
│                          │
└──────────────────────────┘
```

---

## Página 3: Detalle de Producto

### Layout: Modal / Full Page

```
┌──────────────────────────────────────────────────────────────┐
│ [←] Black Lotus - Magic Alpha                      [×] Close │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│ ┌────────────────────────────┐  ┌──────────────────────────┐  │
│ │                            │  │                          │  │
│ │     🎴                     │  │ Black Lotus              │  │
│ │   [Large Card Image]       │  │ Set: Magic Alpha         │  │
│ │   (Gallery below)          │  │ Type: Artifact           │  │
│ │                            │  │ Rarity: ⭐ Rare          │  │
│ │                            │  │ Flavor: The most         │  │
│ │  ◄ ⚫ ⚪ ⚪ ⚪ ►           │  │ powerful of all          │  │
│ │                            │  │ artifacts...             │  │
│ └────────────────────────────┘  │                          │  │
│                                  │ ─────────────────────    │  │
│ Similar Cards:                   │                          │  │
│ ┌────┐ ┌────┐ ┌────┐            │ TCGPlayer Price:        │  │
│ │🎴 │ │🎴 │ │🎴 │            │ $350 - $450             │  │
│ │Mox │ │Cha │ │Zal │            │ Our Price: $425 CLP     │  │
│ │Blue│ │rix │ │mos │            │                          │  │
│ └────┘ └────┘ └────┘            │ Condition:               │  │
│                                  │ 🟢 Mint (PSA 10)        │  │
│                                  │                          │  │
│                                  │ Stock: 🟢 1 in stock    │  │
│                                  │                          │  │
│                                  │ Quantity: [▼ 1 ▲]       │  │
│                                  │                          │  │
│                                  │ ┌──────────────────────┐│  │
│                                  │ │ ▶ Add to Cart         ││  │
│                                  │ └──────────────────────┘│  │
│                                  │ [♥] Wishlist            │  │
│                                  │ [↗] Share               │  │
│                                  │                          │  │
│                                  └──────────────────────────┘  │
│                                                                 │
│ ─────────────────────────────────────────────────────────────  │
│                                                                 │
│ DETAILS                                                        │
│ ─────────────────────────────────────────────────────────────  │
│                                                                 │
│ Descripción:                                                   │
│ Black Lotus es una de las cartas más valiosas de Magic: The  │
│ Gathering, impresa en Alpha (1993). Esta copia está en       │
│ condición Mint y ha sido calificada por PSA en 10.            │
│                                                                 │
│ Especificaciones:                                              │
│ • Set: Alpha (Limited Edition)                                │
│ • Edition: 1st Edition                                        │
│ • Card Number: 1                                              │
│ • Language: English                                           │
│ • Original Rarity: Rare                                       │
│ • Type: Artifact                                              │
│ • Mana Cost: 0                                                │
│ • Power/Toughness: N/A                                        │
│                                                                 │
│ Certificación:                                                │
│ • PSA Grade: 10 (Gem Mint)                                    │
│ • Certificate: PSA 1000001                                    │
│                                                                 │
│ ─────────────────────────────────────────────────────────────  │
│ REVIEWS (234)                                                  │
│ ─────────────────────────────────────────────────────────────  │
│                                                                 │
│ ⭐⭐⭐⭐⭐ (4.9 / 5)                                            │
│                                                                 │
│ "Pristine condition, arrived safely" — Juan C. ✓ Verified   │
│ "Worth every penny" — María G.                               │
│ "Perfect! 10/10 seller" — Carlos L. ✓ Verified              │
│                                                                 │
│ [Load more reviews...]                                         │
│                                                                 │
└──────────────────────────────────────────────────────────────┘
```

---

## Página 4: Carrito

### Layout: Floating Panel / Drawer

```
┌─────────────────────────────────────────┐
│ Shopping Cart (3 items)            [×]  │
├─────────────────────────────────────────┤
│                                          │
│ ITEMS:                                   │
│                                          │
│ ┌─────────────────────────────────────┐  │
│ │ 🎴 Black Lotus (Magic Alpha)       │  │
│ │    Condition: Mint                  │  │
│ │    Price: $425 CLP × 1 = $425      │  │
│ │    [▼ Qty ▲] [Remove]              │  │
│ └─────────────────────────────────────┘  │
│                                          │
│ ┌─────────────────────────────────────┐  │
│ │ 🎴 Pikachu (Pokémon Base Set)      │  │
│ │    Condition: NM                    │  │
│ │    Price: $85 CLP × 2 = $170       │  │
│ │    [▼ Qty ▲] [Remove]              │  │
│ └─────────────────────────────────────┘  │
│                                          │
│ ┌─────────────────────────────────────┐  │
│ │ 🎴 Blue-Eyes (Yu-Gi-Oh)            │  │
│ │    Condition: NM                    │  │
│ │    Price: $25 CLP × 3 = $75        │  │
│ │    [▼ Qty ▲] [Remove]              │  │
│ └─────────────────────────────────────┘  │
│                                          │
│ ───────────────────────────────────────  │
│                                          │
│ Subtotal:          $670 CLP              │
│ Shipping:          $15 CLP               │
│ ─────────────────────────────────────    │
│ TOTAL:             $685 CLP              │
│                                          │
│ [Coupon: WELCOME10]  [Remove]            │
│ Discount: -$68.50 CLP                    │
│ ─────────────────────────────────────    │
│ FINAL TOTAL:       $616.50 CLP           │
│                                          │
│ [Proceed to Checkout]                    │
│ [Continue Shopping]                      │
│                                          │
└─────────────────────────────────────────┘
```

---

## Página 5: Checkout

### Multi-Step Form

```
STEP 1: SHIPPING ADDRESS
┌──────────────────────────────────────────┐
│ ☑ Step 1: Address                        │
│ ○ Step 2: Shipping                       │
│ ○ Step 3: Payment                        │
├──────────────────────────────────────────┤
│                                          │
│ Email: [_____________________@gmail.com]│
│                                          │
│ ☑ Use my profile address                │
│   Juan Carlos C.                         │
│   Av. Providencia 123, Santiago          │
│   Región Metropolitana, Chile            │
│                                          │
│   [Edit] [Use Different]                 │
│                                          │
│ [← Back]  [Next →]                      │
│                                          │
└──────────────────────────────────────────┘

STEP 2: SHIPPING METHOD
┌──────────────────────────────────────────┐
│ ○ Step 1: Address                        │
│ ☑ Step 2: Shipping                       │
│ ○ Step 3: Payment                        │
├──────────────────────────────────────────┤
│                                          │
│ Select Shipping Method:                  │
│                                          │
│ ◉ Standard (5-7 business days)          │
│   $15 CLP                                │
│                                          │
│ ○ Express (2-3 business days)           │
│   $35 CLP                                │
│                                          │
│ ○ Overnight (Next day)                  │
│   $85 CLP                                │
│                                          │
│ ⓘ Insurance available: +$10              │
│ ☑ Add insurance for full value          │
│                                          │
│ [← Back]  [Next →]                      │
│                                          │
└──────────────────────────────────────────┘

STEP 3: PAYMENT
┌──────────────────────────────────────────┐
│ ○ Step 1: Address                        │
│ ○ Step 2: Shipping                       │
│ ☑ Step 3: Payment                        │
├──────────────────────────────────────────┤
│                                          │
│ Payment Method:                          │
│                                          │
│ ◉ Credit/Debit Card                     │
│ ○ PayPal                                 │
│ ○ Bank Transfer                          │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ Card Number:                         │ │
│ │ [____  ____  ____  ____]             │ │
│ │                                      │ │
│ │ Name: [_______________]              │ │
│ │ Expiry: [__/__]  CVC: [___]         │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ Billing Address (same as shipping)      │
│ ☑ Use shipping address                  │
│                                          │
│ ORDER SUMMARY:                           │
│ Subtotal:        $670 CLP               │
│ Shipping:        $15 CLP                │
│ Insurance:       $10 CLP                │
│ Discount:       -$68.50 CLP             │
│ ─────────────────────────────────────── │
│ TOTAL:          $626.50 CLP             │
│                                          │
│ [← Back]  [Place Order]                 │
│                                          │
└──────────────────────────────────────────┘

ORDER CONFIRMATION
┌──────────────────────────────────────────┐
│ ✓ Order Placed Successfully!             │
├──────────────────────────────────────────┤
│                                          │
│ Order Number: #ORD-202604-002931         │
│ Estimated Delivery: April 30, 2026      │
│                                          │
│ Tracking: (Tracking link)               │
│                                          │
│ You will receive an email confirmation   │
│ and tracking details.                    │
│                                          │
│ ORDER SUMMARY:                           │
│ • Black Lotus (Mint) x1                 │
│ • Pikachu (NM) x2                       │
│ • Blue-Eyes (NM) x3                     │
│                                          │
│ Total: $626.50 CLP                      │
│                                          │
│ [Download Invoice]  [Print]              │
│ [Back to Store]  [View Orders]           │
│                                          │
└──────────────────────────────────────────┘
```

---

## Componentes React a Crear

### 1. ProductCard.tsx
```typescript
interface ProductCardProps {
  card: {
    id: string;
    name: string;
    image: string;
    price: number;
    stock: number;
    condition: 'Mint' | 'NM' | 'LP' | 'MP';
    tcg: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON';
    rarity: string;
    reviews: number;
    rating: number;
  };
  onAddToCart: (quantity: number) => void;
  onViewDetails: () => void;
}

// Renders: Image + Name + Price + Rating + Stock + CTA
```

### 2. FilterSidebar.tsx
```typescript
interface FilterSidebarProps {
  onFilterChange: (filters: Filters) => void;
  priceRange: [number, number];
  selectedTCGs: string[];
  selectedRarities: string[];
}

// State: TCG checkbox, Rarity checkbox, Price slider, Condition
```

### 3. ShoppingCart.tsx
```typescript
interface ShoppingCartProps {
  items: CartItem[];
  onRemoveItem: (itemId: string) => void;
  onUpdateQuantity: (itemId: string, quantity: number) => void;
  onCheckout: () => void;
}

// Shows: Item list + quantity controls + totals + CTA
```

### 4. ProductDetailModal.tsx
```typescript
interface ProductDetailModalProps {
  card: Card;
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (quantity: number) => void;
}

// Shows: Large image + full details + specifications + reviews
```

### 5. CheckoutForm.tsx
```typescript
interface CheckoutFormProps {
  onSubmit: (formData: CheckoutData) => void;
  initialData?: CheckoutData;
}

// Multi-step form: address → shipping → payment
```

---

## Funcionalidades JavaScript/React

### useStorefront Hook
```typescript
const {
  products,
  filters,
  setFilters,
  loading,
  error,
  pagination,
  setPagination,
  searchQuery,
  setSearchQuery
} = useStorefront();
```

### useCartPersist Hook
```typescript
const {
  items,
  addItem,
  removeItem,
  updateQuantity,
  total,
  itemCount,
  clearCart
} = useCartPersist();  // localStorage + useState sync
```

### useFilters Hook
```typescript
const {
  tcgFilters,
  priceRange,
  rarityFilters,
  conditionFilters,
  toggleTCG,
  setPriceRange,
  toggleRarity,
  clearAll
} = useFilters();
```

---

## Estilos Visuales (Tailwind CSS + Custom)

### Paleta de Colores
```css
Primary:     #6366F1 (Indigo)     /* Acciones principales */
Secondary:   #EC4899 (Pink)       /* Destacados, ofertas */
Success:     #10B981 (Green)      /* Stock disponible */
Danger:      #EF4444 (Red)        /* Sin stock, errores */
Warning:     #F59E0B (Amber)      /* Advertencias */
Background:  #F3F4F6 (Light Gray)
Card BG:     #FFFFFF
Text Dark:   #111827
Text Muted:  #6B7280
Border:      #E5E7EB
```

### Tipografía
```css
Headlines:  Poppins / Bold / 32px
Subheads:   Poppins / SemiBold / 20px
Body Text:  Inter / Regular / 14px
Small Text: Inter / Regular / 12px
```

### Componentes Reutilizables
- `Button` (primary, secondary, outlined)
- `Card` (shadow, hover effects)
- `Badge` (condition, rarity, stock)
- `Input` (search, filters)
- `Modal` (product detail)
- `Carousel` (featured items)
- `PriceDisplay` (CLP + USD reference)
- `RarityIcon` (visual rarity indicator)

---

## Animaciones & Micro-interactions

### Hover Effects
- Product card: scale 1.05 + shadow
- Button: background fade + slight lift
- Image: zoom effect on hover

### Transitions
- Modal: fade-in + scale from center
- Cart drawer: slide-in from right
- Filter update: debounce 300ms

### Loading States
- Skeleton screens for product grid
- Shimmer effect while loading
- Progress bar for checkout

---

## Responsive Design

### Breakpoints (Tailwind)
```
Mobile:  < 640px
Tablet:  640px - 1024px
Desktop: > 1024px
```

### Adapataciones
- Filters: Side panel (desktop) → Collapsible drawer (mobile)
- Grid: 4 cols (desktop) → 2 cols (tablet) → 1 col (mobile)
- Cart: Floating panel (desktop) → Full-screen drawer (mobile)
- Checkout: Side-by-side (desktop) → Stacked (mobile)

---

## API Integration Points

### Endpoints Necesarios (Frontend calls)

```typescript
GET /api/public/catalog
  Query: { search?, tcg?, rarity?, priceMin?, priceMax?, page?, limit? }
  Response: { products: Card[], total: number, pages: number }

GET /api/public/catalog/:id
  Response: Card (full details)

GET /api/public/search?q=query
  Response: { suggestions: Card[] }

POST /api/cart/add
  Body: { cardId, quantity }
  Response: { success, cartTotal }

POST /api/checkout
  Body: { email, address, shippingMethod, paymentMethod, ... }
  Response: { orderId, status, trackingUrl }

GET /api/order/:id
  Response: Order { items[], status, trackingNumber }
```

---

## Consideraciones Técnicas

### Performance
- Lazy load images (native `loading="lazy"` + Intersection Observer)
- Virtual scroll for large product lists
- Memoize filter updates (debounce)
- Client-side search caching

### Accessibility
- ARIA labels en filtros y botones
- Keyboard navigation en modals
- Color contrast WCAG AA
- Alt text para todas las imágenes

### SEO
- Meta tags dinámicos por producto
- Open Graph para compartir
- Sitemap automático
- Schema.org structured data para cartas

### Error Handling
- Fallback images si imagen no carga
- Error boundaries en componentes
- Mensajes claros de error (network, validation)
- Retry buttons para failed requests

---

## Fase 1 (MVP): 3-5 días

- [x] Homepage landing básica
- [x] Catálogo con grid + filtros
- [x] Carrito persistente (localStorage)
- [x] Detalle de producto
- [x] Checkout mockado (sin procesar pagos)
- [x] Responsive mobile + desktop

## Fase 2 (Enhancements): 1-2 semanas

- [ ] Reviews y ratings reales
- [ ] Wishlist (saved items)
- [ ] Recomendaciones "Similar cards"
- [ ] Dark/light mode
- [ ] Historial de órdenes (logged in)
- [ ] Comparador de precios
- [ ] Video unboxing carousel

## Fase 3 (Production): 2-3 semanas

- [ ] Integración con Stripe checkout real
- [ ] Email confirmación
- [ ] Tracking de envíos
- [ ] Loyalty program
- [ ] Admin dashboard para inventory
- [ ] Analytics (Google Analytics + Mixpanel)

---

**Propuesta completada**: Storefront moderno, responsivo, y lista para demostración.  
**Estimado de desarrollo**: 1-2 sprints (MVP), 2-4 sprints (Full featured).
