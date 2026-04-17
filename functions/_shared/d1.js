function pickDb(env) {
  return env.TCG_D1 || env.DB || env.D1 || env.TCG_ERP_DB || null;
}

async function ensureSchema(db) {
  if (!db) return;
  // Editions
  await db.prepare(`CREATE TABLE IF NOT EXISTS edition (
    id TEXT PRIMARY KEY,
    tcg TEXT,
    editionCode TEXT,
    editionName TEXT,
    releaseDate TEXT,
    isActive INTEGER
  );`).run();

  // Cards
  await db.prepare(`CREATE TABLE IF NOT EXISTS card (
    id TEXT PRIMARY KEY,
    externalId TEXT,
    tcg TEXT,
    editionCode TEXT,
    cardCode TEXT,
    cardName TEXT,
    rarity TEXT,
    imageUrl TEXT,
    priceMarket REAL
  );`).run();

  // Listings
  await db.prepare(`CREATE TABLE IF NOT EXISTS listing (
    id TEXT PRIMARY KEY,
    cardId TEXT,
    editionCode TEXT,
    referencePrice REAL,
    marginMultiplier REAL,
    finalPrice REAL,
    quantity INTEGER,
    status TEXT,
    lastSyncedAt TEXT
  );`).run();

  try {
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_card_tcg_edition ON card(tcg, editionCode);').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_listing_card ON listing(cardId);').run();
  } catch (err) {
    // ignore index creation errors
  }
}

function firstRow(res) {
  if (!res) return null;
  if (Array.isArray(res.results)) return res.results[0] || null;
  if (Array.isArray(res)) return res[0] || null;
  return null;
}

export { pickDb, ensureSchema, firstRow };
