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
    await db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_listing_card_edition ON listing(cardId, editionCode);').run();
  } catch (err) {
    // ignore index creation errors
  }

  // Price history
  await db.prepare(`CREATE TABLE IF NOT EXISTS priceHistory (
    id TEXT PRIMARY KEY,
    listingId TEXT,
    oldPrice REAL,
    newPrice REAL,
    oldReferencePrice REAL,
    newReferencePrice REAL,
    oldExchangeRate REAL,
    newExchangeRate REAL,
    reason TEXT,
    percentChange REAL,
    changedBy TEXT,
    notes TEXT,
    createdAt TEXT
  );`).run();

  // Price sync runs
  await db.prepare(`CREATE TABLE IF NOT EXISTS priceSyncRun (
    id TEXT PRIMARY KEY,
    source TEXT,
    status TEXT,
    notes TEXT,
    total INTEGER,
    updated INTEGER,
    volatile INTEGER,
    failed INTEGER,
    roundingMultiple INTEGER,
    errors TEXT,
    startedAt TEXT,
    completedAt TEXT,
    createdAt TEXT
  );`).run();

  try {
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_priceHistory_listing ON priceHistory(listingId);').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_priceSyncRun_startedAt ON priceSyncRun(startedAt);').run();
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
