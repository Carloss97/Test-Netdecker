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
    cardNumber TEXT,
    rarity TEXT,
    colorIdentity TEXT,
    tags TEXT,
    imageUrl TEXT,
    description TEXT,
    priceLow REAL,
    priceMid REAL,
    priceMarket REAL,
    createdAt TEXT,
    updatedAt TEXT
  );`).run();

  // Listings
  await db.prepare(`CREATE TABLE IF NOT EXISTS listing (
    id TEXT PRIMARY KEY,
    cardId TEXT,
    editionCode TEXT,
    condition TEXT DEFAULT 'NM',
    rarity TEXT,
    quantity INTEGER DEFAULT 0,
    referencePrice REAL DEFAULT 0,
    marginMultiplier REAL DEFAULT 1.2,
    exchangeRate REAL DEFAULT 1.0,
    finalPrice REAL DEFAULT 0,
    currency TEXT DEFAULT 'CLP',
    costPrice REAL,
    status TEXT DEFAULT 'active',
    everHadStock INTEGER DEFAULT 0,
    lastSyncedAt TEXT,
    createdAt TEXT,
    updatedAt TEXT
  );`).run();

  try {
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_card_tcg_edition ON card(tcg, editionCode);').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_listing_card ON listing(cardId);').run();
    await db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_listing_card_edition ON listing(cardId, editionCode);').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_listing_quantity ON listing(quantity);').run();
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

  // App configuration (key/value JSON)
  await db.prepare(`CREATE TABLE IF NOT EXISTS appConfig (
    key TEXT PRIMARY KEY,
    value TEXT,
    updatedAt TEXT
  );`).run();

  // Ensure commonly referenced columns exist on existing tables (safe ALTER TABLE)
  async function addColumnIfMissing(table, column, definition) {
    try {
      const infoRes = await db.prepare(`PRAGMA table_info(${table});`).all();
      const infoRows = Array.isArray(infoRes?.results) ? infoRes.results : (Array.isArray(infoRes) ? infoRes : []);
      const colNames = infoRows.map((r) => r.name || r.NAME || Object.values(r)[1]);
      if (!colNames.includes(column)) {
        await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`).run();
      }
    } catch (err) {
      // ignore errors when trying to alter existing schema
    }
  }

  // Listing table may have been created with older schema. Ensure commonly used columns exist.
  await addColumnIfMissing('listing', 'condition', "TEXT DEFAULT 'NM'");
  await addColumnIfMissing('listing', 'rarity', 'TEXT');
  await addColumnIfMissing('listing', 'exchangeRate', 'REAL DEFAULT 1.0');
  await addColumnIfMissing('listing', 'finalPrice', 'REAL DEFAULT 0');
  await addColumnIfMissing('listing', 'currency', "TEXT DEFAULT 'CLP'");
  await addColumnIfMissing('listing', 'costPrice', 'REAL');
  await addColumnIfMissing('listing', 'everHadStock', 'INTEGER DEFAULT 0');
  await addColumnIfMissing('listing', 'lastSyncedAt', 'TEXT');
  await addColumnIfMissing('listing', 'createdAt', 'TEXT');
  await addColumnIfMissing('listing', 'updatedAt', 'TEXT');

  // PriceHistory may have newer columns in some versions
  await addColumnIfMissing('priceHistory', 'oldExchangeRate', 'REAL');
  await addColumnIfMissing('priceHistory', 'newExchangeRate', 'REAL');
}

function firstRow(res) {
  if (!res) return null;
  if (Array.isArray(res.results)) return res.results[0] || null;
  if (Array.isArray(res)) return res[0] || null;
  return null;
}

export { pickDb, ensureSchema, firstRow };
