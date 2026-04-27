import express from 'express';
import ReviewService from '../services/ReviewService.js';
import { ValidationError } from '../utils/errors.js';

const router = express.Router();

/**
 * GET /api/public/reviews/:listingId
 */
router.get('/reviews/:listingId', async (req, res) => {
  const reviews = await ReviewService.getListingReviews(String(req.params.listingId));
  const stats = await ReviewService.getAverageRating(String(req.params.listingId));
  res.json({ success: true, reviews, stats });
});

// Public embeddable catalog view for a store slug
// Example: GET /tienda/mi-tienda/catalogo
router.get('/:slug/catalogo', (req, res) => {
  const slug = String(req.params.slug || '');
  const html = `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <title>Catálogo - ${slug}</title>
      <style>
        body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial; padding: 12px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
        .card { border: 1px solid #e5e7eb; padding: 8px; border-radius: 8px; text-align: center; }
        .card img { max-width: 100%; height: 120px; object-fit: contain; }
        .price { font-weight: 700; margin-top: 6px; }
        .name { font-size: 0.9rem; }
      </style>
    </head>
    <body>
      <h2>Catálogo de ${slug}</h2>
      <div id="catalog" class="grid">Cargando…</div>

      <script>
        async function load() {
          try {
            const res = await fetch('/api/listings/available', {
              headers: { 'x-store-slug': '${slug}' }
            });
            if (!res.ok) throw new Error('Network response not ok');
            const data = await res.json();
            const container = document.getElementById('catalog');
            container.innerHTML = '';
            if (!Array.isArray(data) || data.length === 0) {
              container.innerHTML = '<div>No hay items disponibles</div>';
              return;
            }

            data.forEach((listing) => {
              const div = document.createElement('div');
              div.className = 'card';
              const img = document.createElement('img');
              img.src = listing.card?.imageUrl || '';
              img.alt = listing.card?.cardName || '';
              const name = document.createElement('div');
              name.className = 'name';
              name.textContent = listing.card?.cardName || 'Sin nombre';
              const qty = document.createElement('div');
              qty.textContent = 'Stock: ' + (listing.quantity ?? 0);
              const price = document.createElement('div');
              price.className = 'price';
              price.textContent = listing.finalPrice ? listing.finalPrice + ' CLP' : '';
              div.appendChild(img);
              div.appendChild(name);
              div.appendChild(qty);
              div.appendChild(price);
              container.appendChild(div);
            });
          } catch (err) {
            const container = document.getElementById('catalog');
            container.innerHTML = '<div>Error cargando catálogo</div>';
            console.error(err);
          }
        }
        load();
      </script>
    </body>
  </html>`;

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

export default router;
