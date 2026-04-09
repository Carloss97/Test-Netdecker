import express from 'express';
import { createServer } from 'http';

export async function startFixtureServer() {
  const app = express();
  app.use(express.json());

  // Scryfall-like endpoints
  app.get('/sets', (_req, res) => {
    res.json({ data: [{ code: 'TST', name: 'Test Set', released_at: '2020-01-01', card_count: 1 }] });
  });

  app.get('/cards/search', (_req, res) => {
    res.json({ data: [] });
  });

  app.get('/cards/named', (_req, res) => {
    res.json({ id: 'fixture-1', name: 'Fixture Card' });
  });

  app.get('/cards/:id', (_req, res) => {
    res.json({ id: 'fixture-1', name: 'Fixture Card' });
  });

  // Pokemon TCG-like endpoints
  app.get('/cards', (_req, res) => {
    res.json({ data: [] });
  });

  app.get('/sets', (_req, res) => {
    res.json({ data: [] });
  });

  // TCGCsv (tcgcsv.com) mirror endpoints under /tcgplayer
  app.get('/tcgplayer/:categoryId/groups', (_req, res) => {
    res.json({ results: [] });
  });

  app.get('/tcgplayer/:categoryId/:groupId/products', (_req, res) => {
    res.json({ results: [] });
  });

  app.get('/tcgplayer/:categoryId/:groupId/prices', (_req, res) => {
    res.json({ results: [] });
  });

  // Generic fallback
  app.get('*', (_req, res) => res.json({}));

  const server = createServer(app);

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const url = `http://127.0.0.1:${port}`;

  return {
    url,
    close: async () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
