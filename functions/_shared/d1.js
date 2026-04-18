function pickDb(env) {
  return env.TCG_D1 || env.DB || env.D1 || env.TCG_ERP_DB || null;
}

async function ensureSchema(db) {
  if (!db) return;

  try {
    if (globalThis.__TCG_D1_SCHEMA_INITIALIZED_V1) return;
  } catch (_) {}
  const _t0 = Date.now();

  // create tables
  await db.prepare(`CREATE TABLE IF NOT EXISTS edition (
    id TEXT PRIMARY KEY,
    tcg TEXT,
    editionCode TEXT,
    editionName TEXT,
    releaseDate TEXT,
    isActive INTEGER
  );`).run();

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

  await db.prepare(`CREATE TABLE IF NOT EXISTS listing (
    id TEXT PRIMARY KEY,
    cardId TEXT,
    editionCode TEXT,
    condition TEXT DEFAULT 'NM',
    rarity TEXT,
    quantity INTEGER DEFAULT 0,
    referencePrice REAL DEFAULT 0,
    marginMultiplier REAL DEFAULT 1.0,
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

  // Order and POS related tables used by functions and lightweight D1 flows
  await db.prepare(`CREATE TABLE IF NOT EXISTS "order" (
    id TEXT PRIMARY KEY,
    storeId TEXT,
    orderNumber TEXT UNIQUE,
    customerEmail TEXT,
    status TEXT,
    subtotal REAL,
    tax REAL,
    total REAL,
    shippingAddress TEXT,
    notes TEXT,
    receiptUrl TEXT,
    createdAt TEXT,
    updatedAt TEXT
  );`).run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS orderItem (
    id TEXT PRIMARY KEY,
    cartId TEXT,
    orderId TEXT,
    listingId TEXT,
    quantity INTEGER,
    pricePerUnit REAL,
    subtotal REAL,
    createdAt TEXT
  );`).run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS cart (
    id TEXT PRIMARY KEY,
    sessionId TEXT,
    createdAt TEXT,
    updatedAt TEXT
  );`).run();

  try {
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_cart_sessionId ON cart(sessionId);').run();
  } catch (err) {
    // ignore index creation errors
  }

  await db.prepare(`CREATE TABLE IF NOT EXISTS stockMovement (
    id TEXT PRIMARY KEY,
    listingId TEXT,
    warehouseId TEXT,
    fromWarehouseId TEXT,
    toWarehouseId TEXT,
    quantity INTEGER,
    type TEXT,
    reference TEXT,
    performedBy TEXT,
    createdAt TEXT
  );`).run();

  try {
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_order_orderNumber ON "order"(orderNumber);').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_orderItem_orderId ON orderItem(orderId);').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_stockMovement_listingId ON stockMovement(listingId);').run();
  } catch (err) {
    // ignore index creation errors
  }

  // POS sessions and transactions
  await db.prepare(`CREATE TABLE IF NOT EXISTS pOSSession (
    id TEXT PRIMARY KEY,
    sessionId TEXT UNIQUE,
    storeId TEXT,
    userId TEXT,
    items TEXT,
    subtotal REAL,
    tax REAL,
    total REAL,
    status TEXT,
    createdAt TEXT,
    updatedAt TEXT
  );`).run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS paymentTransaction (
    id TEXT PRIMARY KEY,
    sessionId TEXT,
    method TEXT,
    amount REAL,
    status TEXT,
    processorResponse TEXT,
    processorReference TEXT,
    createdAt TEXT,
    updatedAt TEXT
  );`).run();

  try {
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_possession_sessionId ON pOSSession(sessionId);').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_paymentTransaction_sessionId ON paymentTransaction(sessionId);').run();
  } catch (err) {
    // ignore index creation errors
  }

  // Cash session table for register open/close operations
  await db.prepare(`CREATE TABLE IF NOT EXISTS cashSession (
    id TEXT PRIMARY KEY,
    sessionId TEXT UNIQUE,
    storeId TEXT,
    openedBy TEXT,
    closedBy TEXT,
    startingCash REAL,
    endingCash REAL,
    status TEXT,
    createdAt TEXT,
    closedAt TEXT,
    updatedAt TEXT
  );`).run();

  try {
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_cashSession_sessionId ON cashSession(sessionId);').run();
  } catch (err) {}

  // Invoice table
  await db.prepare(`CREATE TABLE IF NOT EXISTS invoice (
    id TEXT PRIMARY KEY,
    storeId TEXT,
    orderId TEXT,
    journalEntryId TEXT,
    invoiceNumber TEXT UNIQUE,
    date TEXT,
    total REAL,
    currency TEXT DEFAULT 'CLP',
    pdfUrl TEXT,
    createdAt TEXT
  );`).run();

  try {
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_invoice_orderId ON invoice(orderId);').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_invoice_invoiceNumber ON invoice(invoiceNumber);').run();
  } catch (err) {}

  // Admin users and sessions for lightweight admin auth in Functions
  await db.prepare(`CREATE TABLE IF NOT EXISTS adminUser (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    passwordHash TEXT,
    passwordSalt TEXT,
    role TEXT DEFAULT 'ADMIN',
    isActive INTEGER DEFAULT 1,
    lastLoginAt TEXT,
    createdAt TEXT,
    updatedAt TEXT
  );`).run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS adminSession (
    id TEXT PRIMARY KEY,
    token TEXT UNIQUE,
    userId TEXT,
    expiresAt TEXT,
    createdAt TEXT
  );`).run();

  try {
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_adminSession_userId ON adminSession(userId);').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_adminUser_email ON adminUser(email);').run();
  } catch (err) {}

  // Inventory import history table
  await db.prepare(`CREATE TABLE IF NOT EXISTS inventoryImport (
    id TEXT PRIMARY KEY,
    fileName TEXT,
    status TEXT,
    totalRecords INTEGER,
    successCount INTEGER,
    failureCount INTEGER,
    createdAt TEXT,
    completedAt TEXT
  );`).run();

  try {
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_inventoryImport_createdAt ON inventoryImport(createdAt);').run();
  } catch (err) {}

  // Stock snapshots for periodic inventory checks
  await db.prepare(`CREATE TABLE IF NOT EXISTS stockSnapshot (
    id TEXT PRIMARY KEY,
    listingId TEXT,
    warehouseId TEXT,
    quantity INTEGER,
    takenAt TEXT,
    createdAt TEXT
  );`).run();

  try {
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_stockSnapshot_listingId ON stockSnapshot(listingId);').run();
  } catch (err) {}

  // Reservations for temporary holds (e.g., cart reservations)
  await db.prepare(`CREATE TABLE IF NOT EXISTS reservation (
    id TEXT PRIMARY KEY,
    listingId TEXT,
    warehouseId TEXT,
    quantity INTEGER,
    reservedBy TEXT,
    expiresAt TEXT,
    status TEXT,
    createdAt TEXT,
    updatedAt TEXT
  );`).run();

  try {
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_reservation_status_expiresAt ON reservation(status, expiresAt);').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_reservation_listingId ON reservation(listingId);').run();
  } catch (err) {}

  // Exchange rate table for USD->CLP and other currency pairs
  await db.prepare(`CREATE TABLE IF NOT EXISTS exchangeRate (
    id TEXT PRIMARY KEY,
    fromCurrency TEXT,
    toCurrency TEXT,
    rate REAL,
    source TEXT,
    fetchedAt TEXT,
    expiresAt TEXT
  );`).run();

  try {
    await db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_exchangeRate_pair ON exchangeRate(fromCurrency, toCurrency);').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_exchangeRate_from ON exchangeRate(fromCurrency);').run();
  } catch (err) {}

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
      const colNames = infoRows.map((r) => (r && (r.name || r.NAME)) || Object.values(r)[1]);
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

  // Card table may have been created with older schema in some D1 instances.
  // Ensure commonly referenced card columns exist so queries referencing
  // `c.priceMid`, `c.priceMarket`, `c.cardNumber`, etc. do not fail.
  await addColumnIfMissing('card', 'cardNumber', 'TEXT');
  await addColumnIfMissing('card', 'tags', 'TEXT');
  await addColumnIfMissing('card', 'priceLow', 'REAL');
  await addColumnIfMissing('card', 'priceMid', 'REAL');
  await addColumnIfMissing('card', 'priceMarket', 'REAL');
  await addColumnIfMissing('card', 'imageUrl', 'TEXT');
  await addColumnIfMissing('card', 'externalId', 'TEXT');
  await addColumnIfMissing('card', 'cardCode', 'TEXT');
  await addColumnIfMissing('card', 'createdAt', 'TEXT');
  await addColumnIfMissing('card', 'updatedAt', 'TEXT');

  // PriceHistory may have newer columns in some versions
  await addColumnIfMissing('priceHistory', 'oldExchangeRate', 'REAL');
  await addColumnIfMissing('priceHistory', 'newExchangeRate', 'REAL');

  try {
    const checked = globalThis.__TCG_D1_SCHEMA_TABLES_V1 || new Set();
    globalThis.__TCG_D1_SCHEMA_TABLES_V1 = checked;
  } catch (_) {}

  try {
    globalThis.__TCG_D1_SCHEMA_INITIALIZED_V1 = true;
  } catch (_) {}
  const _t1 = Date.now() - _t0;
  try { console.log(`[d1] ensureSchema completed in ${_t1}ms`); } catch(_) {}
}

function firstRow(res) {
  if (!res) return null;
  if (Array.isArray(res.results)) return res.results[0] || null;
  if (Array.isArray(res)) return res[0] || null;
  return null;
}

// Return array of column names for a table, with a lightweight cache in globalThis
async function getTableColumns(db, table) {
  if (!db || !table) return [];
  try {
    const cache = globalThis.__TCG_D1_COLUMNS_CACHE_V1 || (globalThis.__TCG_D1_COLUMNS_CACHE_V1 = {});
    if (cache[table]) return cache[table];
    const res = await db.prepare(`PRAGMA table_info(${table});`).all();
    const rows = Array.isArray(res?.results) ? res.results : (Array.isArray(res) ? res : []);
    const cols = rows.map((r) => (r && (r.name || r.NAME)) || Object.values(r)[1]).filter(Boolean);
    cache[table] = cols;
    return cols;
  } catch (err) {
    return [];
  }
}

// Build a SELECT fragment for a given table alias/table name and desired columns only if present
async function buildSelectColumns(db, tableName, alias, desired) {
  // When no DB is provided, return alias-qualified columns (caller usually guards against missing DB).
  if (!db) return desired.map((c) => `${alias}.${c} AS ${c}`).join(', ');

  // Query actual table columns and build a safe select list where missing columns are projected
  // as NULL so queries keep stable column names across schema versions.
  const existing = await getTableColumns(db, tableName);
  const parts = desired.map((c) => {
    if (existing && existing.includes(c)) return `${alias}.${c} AS ${c}`;
    return `NULL AS ${c}`;
  });
  return parts.join(', ');
}

export { pickDb, ensureSchema, firstRow, getTableColumns, buildSelectColumns };

// Safely rename the alias for a selected column inside a SELECT fragment
// Ensures we replace patterns like `alias.col AS col` or `NULL AS col` with `alias.col AS newAlias`
function aliasSelectColumn(selectFragment, alias, column, newAlias) {
  if (!selectFragment || !alias || !column || !newAlias) return selectFragment;
  try {
    // Replace explicit alias pattern: alias.col AS col -> alias.col AS newAlias
    const reExplicit = new RegExp(`\\b${alias}\\.${column}\\s+AS\\s+${column}\\b`, 'gi');
    selectFragment = selectFragment.replace(reExplicit, `${alias}.${column} AS ${newAlias}`);
    // Replace NULL projection: NULL AS col -> NULL AS newAlias
    const reNull = new RegExp(`\\bNULL\\s+AS\\s+${column}\\b`, 'gi');
    selectFragment = selectFragment.replace(reNull, `NULL AS ${newAlias}`);
    // Replace bare alias.column when no AS present: alias.col -> alias.col AS newAlias
    const reBare = new RegExp(`\\b${alias}\\.${column}\\b(?!\\s+AS)`, 'g');
    selectFragment = selectFragment.replace(reBare, `${alias}.${column} AS ${newAlias}`);
  } catch (_) {}
  return selectFragment;
}

export { aliasSelectColumn };
