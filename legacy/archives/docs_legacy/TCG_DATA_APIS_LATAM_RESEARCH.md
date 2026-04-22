# TCG Data APIs & Pricing Sources for LATAM - Research Report
**Date:** April 4, 2026
**Purpose:** Identify free/open APIs and alternative pricing sources for a LATAM-based TCG shop

---

## 1. FREE/OPEN TCG DATA APIs - Global Coverage

### 1.1 Magic: The Gathering - Scryfall

**Status:** ✅ Active & Well-Maintained

**Data Provided:**
- Complete Magic card database (all sets and editions)
- Card metadata: mana costs, types, abilities, power/toughness
- Card images and high-res artwork
- Set information and rulings
- Card symbols and catalogs
- Bulk data downloads for offline access
- Market price data (integrated from multiple sources)
- Deck formats and legality information

**Geographic Coverage:**
- Fully global - no geographic restrictions mentioned
- Card data is universal across regions

**Cost:** 100% FREE - No API key required, but higher rate limits available with registration

**Terms of Service Requirements:**
- Cannot "paywall" or charge for card data access
- Cannot create competing Magic games or imply non-Magic origins
- Must not distort, blur, or obscure artist credits
- Cannot imply Scryfall endorsement
- Perfect for community projects and businesses

**Rate Limits:**
- Unauthenticated: Limited requests
- Authenticated (free): Reasonable rate limits for most use cases

**Pros:**
- Most complete Magic data available
- Production-ready, reliable API
- Clear terms allowing commercial use
- Excellent documentation
- Regular updates with new sets
- Supports bulk data exports

**Cons:**
- Magic-only (not multi-game)
- No LATAM-specific pricing
- Pricing data sourced from other providers

**Recommended for:** Magic-focused shops in LATAM

---

### 1.2 Pokémon Trading Card Game - Pokémon TCG API (Now Scrydex)

**Status:** ✅ Active - Transitioned to Scrydex Suite

**Data Provided:**
- Complete Pokémon card database
- Card sets, types, subtypes, supertypes
- Card rarities and release information
- Images and metadata
- **NOTE:** Pricing data is NOT included in the free API (see Scrydex below)

**Geographic Coverage:**
- Global coverage for card data
- No LATAM-specific regional data

**Cost:** FREE - No registration required (limited rate limits)
- Registration available for higher rate limits (free tier)

**API Structure:** REST-based, returns JSON data

**Rate Limits:**
- Unauthenticated: Very restrictive
- Authenticated (free): Much more usable

**Pros:**
- Official Pokémon data
- Simple REST API
- Good for card metadata and identification
- Reliable data quality

**Cons:**
- No pricing information in free tier
- Rate limits restrict heavy usage without registration
- Being consolidated into Scrydex (may change in future)
- Doesn't provide LATAM-specific information

**Recommended for:** Pokémon shops needing card data without pricing

---

### 1.3 Yu-Gi-Oh! - YGOPRODeck Community Platform

**Status:** ✅ Active Community Project

**Data Provided:**
- 14,435+ Yu-Gi-Oh cards
- Deck database (431,986+ user decks)
- Card metadata and abilities
- Tournament information and results
- Format support: TCG, OCG, Genesys, Master Duel
- Integrated pricing from TCGPlayer and Cardmarket

**Geographic Coverage:**
- Global card data
- Pricing integrates Cardmarket (includes some European/LATAM coverage)
- TCGPlayer pricing limited (geo-blocked from LATAM)

**Cost:** FREE - Platform is free to use with optional premium subscription

**API Status:**
- Platform exists but **no official public API documented**
- Data accessible via web scraping (see "Workarounds" section)
- Community-driven, not official from Konami

**Pros:**
- Most comprehensive free Yu-Gi-Oh resource
- Active community
- Integrated Cardmarket pricing (LATAM-relevant)
- Searchable database

**Cons:**
- No documented public API
- Would require web scraping for integration
- Community-run (unofficial)
- Pricing through third-party integrations only

**Recommended for:** Yu-Gi-Oh shops as data source + Cardmarket for LATAM pricing

---

### 1.4 One Piece Trading Card Game - Limited/No Official API

**Status:** ⚠️ No Free Official API

**Current Situation:**
- Official One Piece TCG maintained by Bandai
- No public API available as of 2026
- Deck building sites exist but no free data API
- Limited third-party coverage

**Data Sources:**
- Bulbapedia/community wikis (manual scraping possible)
- Deck builder sites (limited access)
- Bandai official site (no API, requires scraping)

**Alternatives:**
- Wait for Scrydex to complete One Piece integration (currently in beta - see below)
- Web scraping from official/community sources

**Pros:**
- Growing game with potential
- Official data is accurate

**Cons:**
- No free API currently available
- Would require scraping (legal considerations)
- Limited community infrastructure
- Small LATAM presence

**Recommended for:** Not recommended unless using Scrydex premium tier or accepting manual data management

---

## 2. COMMERCIAL/HYBRID API SERVICES

### 2.1 Scrydex - Premium TCG API Suite

**Status:** ✅ Active & Growing

**Supported Games:**
- ✅ Pokémon TCG (full support)
- ✅ Magic: The Gathering (full support)
- ✅ Lorcana (full support)
- ✅ Gundam (full support)
- 🟡 One Piece (beta)
- 🟡 Riftbound (beta)
- 🔜 Digimon (coming soon)
- 🔜 Yu-Gi-Oh! (coming soon)

**Data Provided:**
- Card metadata and images
- **Live market prices** (key differentiator)
- **Historical pricing data**
- Graded card prices (PSA, CGC, TAG)
- Price trends and analytics
- Competitive legality information
- Community sentiment data
- Image recognition technology

**Pricing Tiers:**
1. **Starter:** $29/month - 5,000 API credits
2. **Pro:** $99/month - 50,000 API credits
3. **Business:** $299/month - 500,000 API credits
4. **Enterprise:** Custom pricing with dedicated support

**Geographic Coverage:**
- Global pricing data
- **Includes LATAM pricing sources** (advantage over free APIs)

**Pros:**
- Multi-game support (growing)
- Live pricing updates crucial for retail
- Historical data for trend analysis
- Image recognition feature
- Professional-grade API
- Best option for growing portfolio (upcoming games)

**Cons:**
- Paid service ($29/month minimum)
- Moderate credit limits on lower tiers
- Still in beta for One Piece/Riftbound
- Not ideal for budget-constrained startups

**Recommendation:** Best compromise between free and fully managed, good for LATAM retailers

---

## 3. ALTERNATIVE PRICING SOURCES FOR LATAM

### 3.1 Cardmarket - European/Global Marketplace

**Status:** ✅ Active - Primary European TCG Platform

**Coverage:**
- **Geographic:** Europe-focused, LIMITED LATAM presence
- **Supported Games:** Magic, Pokémon, Yu-Gi-Oh, One Piece, Lorcana, Flesh and Blood
- **Pricing:** Dynamic, thousands of sellers

**API Status:**
- **Has API** but access restricted (403 errors on public access attempts)
- Likely requires authentication and partner agreement
- Not easily accessible for new businesses

**Data Available:**
- Card pricing from European/EU sellers
- Market trends
- Seller ratings and inventory

**LATAM Availability:**
- ⚠️ Limited shipping to LATAM countries
- Some LATAM sellers on platform (primarily Brazil, Mexico, Colombia)
- Prices in EUR - requires conversion
- Not optimized for LATAM retailers

**Pros:**
- Official marketplace with real pricing
- Trusted community
- Multiple games supported
- Transparent pricing from many sellers

**Cons:**
- **No easy public API access**
- European-focused pricing (not relevant to LATAM market)
- High shipping costs to LATAM
- Seller base primarily European
- Would need API partnership

**Recommendation:** Limited usefulness for LATAM pricing; better as competitor analysis tool

---

### 3.2 TCGPlayer - North American Focus (Geo-Blocked from LATAM)

**Status:** ✅ Active - Largest North American TCG Platform

**Coverage:**
- Supports Magic, Pokémon, Yu-Gi-Oh, One Piece
- 10,000+ sellers
- Extensive pricing data

**API Status:**
- **Has documented API** but requires authentication
- Authentication requires partnership/approval
- Website displays "JS required" errors; not directly accessible

**LATAM Issue:**
- ⚠️ **Website is geo-blocked from many LATAM countries**
- Not available to LATAM customers
- Even API access likely restricted by region

**Geo-Blocking Workarounds:**
- VPN access is technically possible but:
  - Violates terms of service
  - Not recommended for business use
  - Prices are in USD (not local currency)
  - Shipping from North America expensive to LATAM

**Pros:**
- Largest TCG marketplace in North America
- Most comprehensive pricing data
- Professional API documentation
- Real-time inventory

**Cons:**
- **Geo-blocked from LATAM** (cannot access from most LA countries)
- USD pricing only
- Expensive shipping to LATAM
- Requires API partnership (not available to small businesses)
- VPN "solutions" violate ToS and are unreliable

**Recommendation:** NOT viable for LATAM shop - skip this option

---

### 3.3 Mercado Libre - LATAM Marketplace

**Status:** ✅ Active - Largest LATAM e-commerce platform

**Coverage:**
- **Massive LATAM presence:** Argentina, Brazil, Mexico, Colombia, Peru, Chile, etc.
- Many individual TCG sellers
- Competitive local pricing
- Supports all TCGs (through individual sellers)

**API Status:**
- **Official Mercado Libre API exists** (OAuth-based)
- Requires developer registration
- API documentation available
- Allows product searches and pricing data

**Data Available:**
- Product listings and prices
- Seller ratings
- Shipping information
- Sales history (if seller)
- Local currency pricing

**LATAM Advantage:**
- ✅ Direct access to LATAM pricing data
- ✅ Local currencies (ARS, BRL, MXN, etc.)
- ✅ Relevant shipping costs
- ✅ Large seller community

**Pros:**
- True LATAM-specific pricing
- Official API (more stable than scraping)
- Local currency support
- Easy seller registration for your own shop
- Largest LATAM audience

**Cons:**
- API requires integration work
- Pricing volatile (many individual sellers)
- Quality control variable
- Commission fees if selling on platform
- Less stable pricing than centralized sources

**Recommendation:** ⭐ EXCELLENT for LATAM pricing intelligence and market analysis

---

## 4. WEB SCRAPING - LEGAL & ETHICAL CONSIDERATIONS

### When Scraping is Generally Legal:
- ✅ Public data (no login required)
- ✅ Respected robots.txt guidelines
- ✅ Reasonable rate limiting (not hammering server)
- ✅ Not copyrighted content (pricing data OK, card images problematic)
- ✅ Terms of Service explicitly allow it

### When Scraping is Illegal/Unethical:
- ❌ Behind authentication/paywalls
- ❌ Explicitly prohibited by ToS
- ❌ Copyrighted images
- ❌ High-frequency requests causing server strain
- ❌ Personal/protected information
- ❌ Commercial databases (without license)

### Sources Safe to Scrape for Pricing:
1. **Mercado Libre** - Allows scraping if respectful (check ToS)
2. **YGOPRODeck** - Community-friendly, pricing public
3. **MTGGoldfish** - Pricing data publicly available
4. **PriceCharting** - Collectibles pricing, check ToS
5. **Community wikis** - Generally permissive

### Sources NOT Safe to Scrape:
- ❌ Cardmarket (ToS prohibits scraping)
- ❌ TCGPlayer (ToS prohibits scraping)
- ❌ Card images from official sources (copyright)
- ❌ Protected databases

---

## 5. KNOWN LIMITATIONS & WORKAROUNDS

### Limitation 1: TCGPlayer Geo-Blocking

**Problem:** TCGPlayer is inaccessible from most LATAM countries

**Why It Happens:**
- Regional licensing restrictions
- Payment processing limitations
- Inventory management per region

**Workaround Options:**

| Option | Feasibility | Reliability | Legal Status |
|--------|-------------|-------------|--------------|
| **VPN Access** | Easy | Poor | ⚠️ Violates ToS |
| **Reseller Account** | Medium | Good | ✅ Legitimate |
| **API Partnership** | Hard | Excellent | ✅ Legitimate |
| **Alternative Sources** | Easy | Varies | ✅ Legitimate |

**Recommended:** Abandon TCGPlayer, use alternatives (Mercado Libre, Cardmarket)

---

### Limitation 2: Data Freshness & Update Frequency

**Free API Update Frequency:**

| Source | Update Frequency | Lag Time | Issue |
|--------|------------------|----------|-------|
| **Scryfall** | Real-time | <1 hour | Pricing from external sources |
| **Pokémon TCG API** | Quarterly-ish | Days-weeks | Limited frequency, being consolidated |
| **YGOPRODeck** | Community-driven | Variable | Depends on volunteers |
| **MTGGoldfish** | Daily | <24 hours | Card/prices only |
| **Mercado Libre** | Real-time | <5 minutes | Highly variable seller data |

**Workaround:**
- Combine multiple sources
- Use Scrydex for real-time updates (paid)
- Implement local caching with update schedules
- Use webhooks/polling for price changes

---

### Limitation 3: Pricing Accuracy & Reliability

**Challenges:**
1. **Market Volatility** - Prices fluctuate hourly
2. **Source Bias** - Different markets have different prices
3. **Seller Variation** - Individual sellers set own prices
4. **Regional Differences** - LATAM markets vary significantly by country

**Reliability Ranking (Best to Worst):**

1. ⭐⭐⭐⭐⭐ **Scrydex** - Professional aggregation, historical data
2. ⭐⭐⭐⭐ **MTGGoldfish** - Reputable community, consistent methodology
3. ⭐⭐⭐⭐ **Mercado Libre API** - Real LATAM market data
4. ⭐⭐⭐ **Cardmarket** - European market, established
5. ⭐⭐⭐ **YGOPRODeck** - Community-sourced from Cardmarket/TCGPlayer
6. ⭐⭐ **Scraping individual sites** - Variable quality
7. ⭐ **Isolated sources** - Subject to manipulation

**Workaround:**
- Weight multiple sources by reputation
- Use median pricing from 3+ sources
- Implement manual price verification for high-value cards
- Track price history for anomaly detection

---

### Limitation 4: Multi-Game Support

**Current Gap:** No single free API covers all popular TCGs

**Game Coverage by API:**

| Game | Scryfall | Pokémon API | Scrydex | YGOPRODeck | Cardmarket |
|------|----------|-------------|---------|------------|-----------|
| Magic | ✅✅✅ | ❌ | ✅ | ❌ | ✅ |
| Pokémon | ❌ | ✅✅ | ✅ | ❌ | ✅ |
| Yu-Gi-Oh | ❌ | ❌ | 🔜 | ✅ (no API) | ✅ |
| One Piece | ❌ | ❌ | 🟡 | ❌ | ✅ |
| Lorcana | ❌ | ❌ | ✅ | ❌ | ✅ |

**Workaround:** Combination approach (see Section 6 below)

---

## 6. RECOMMENDED HYBRID APPROACH FOR LATAM TCG SHOP

### Scenario A: Budget-Conscious Startup (Minimal Cost)

**Architecture:**
```
┌─────────────────────────────────────┐
│   Your LATAM TCG Shop               │
├─────────────────────────────────────┤
│                                     │
├─ Scryfall API (Magic) ──────────────┤
│  └─ Free, real-time card data      │
│                                     │
├─ Pokémon TCG API (Pokémon) ────────┤
│  └─ Free, card metadata only       │
│                                     │
├─ YGOPRODeck Scraping (Yu-Gi-Oh) ───┤
│  └─ Web scraping (legal)           │
│                                     │
├─ Mercado Libre API (LATAM Pricing) ┤
│  └─ Real local market data         │
│                                     │
└─────────────────────────────────────┘
```

**Implementation:**

1. **Magic Cards:**
   - Use Scryfall API for complete card data
   - Aggregate LATAM pricing from Mercado Libre ML API
   - Fallback: Cardmarket (EUR to local currency)

2. **Pokémon Cards:**
   - Use Pokémon TCG API for card metadata
   - Pricing: Mercado Libre (primary) + Cardmarket (secondary)
   - Consider Scrydex later if budget allows

3. **Yu-Gi-Oh Cards:**
   - Web scrape YGOPRODeck.com (publicly available, community-friendly)
   - Pricing: Mercado Libre + Cardmarket
   - Monitor for official API (Scrydex adding soon)

4. **One Piece Cards:**
   - Manual data entry or scraping (very limited free sources)
   - Pricing: Mercado Libre only
   - Wait for Scrydex One Piece beta completion

**Cost:** ✅ $0/month (development time only)

**Pros:**
- Completely free
- Full control over data
- Real LATAM pricing

**Cons:**
- Significant development required
- Manual scraping maintenance
- Price freshness varies by source
- Limited One Piece support

**Best For:** Technical teams with limited budget, Magic/Pokémon focused shops

---

### Scenario B: Growth-Focused Business (Hybrid Approach)

**Recommended Setup:**

1. **Free APIs (Foundation):**
   - Scryfall for Magic
   - Pokémon TCG API for Pokémon
   - Mercado Libre API for LATAM pricing

2. **Scrydex Subscription (Pricing & Expansion):**
   - $29-99/month tier
   - Real-time pricing across all supported games
   - Historical data for analytics
   - Upcoming One Piece/Yu-Gi-Oh support

3. **Manual Data + Community:**
   - One Piece: Manual entry from Bandai or scraping
   - Yu-Gi-Oh: Wait for Scrydex or scrape YGOPRODeck

**Architecture:**
```
┌──────────────────────────────────────────┐
│   Hybrid TCG Shop Platform               │
├──────────────────────────────────────────┤
│                                          │
│  Tier 1: Free APIs                       │
│  ├─ Scryfall (Magic) ✅                  │
│  ├─ Pokémon TCG API ✅                   │
│  └─ Mercado Libre API ✅                 │
│                                          │
│  Tier 2: Scrydex ($29-99/month)         │
│  ├─ Real-time pricing ✅                 │
│  ├─ Multi-game support ✅                │
│  └─ Analytics/trends ✅                  │
│                                          │
│  Tier 3: Community/Manual                │
│  ├─ YGOPRODeck scraping                  │
│  └─ One Piece manual entry               │
│                                          │
└──────────────────────────────────────────┘
```

**Cost:** 💰 $29-99/month + development time

**Pros:**
- Real-time pricing crucial for retail
- Professional-grade infrastructure
- Future-proofs for upcoming games
- LATAM-specific data
- Historical analytics for business intelligence

**Cons:**
- Monthly subscription cost
- Still manual for some games
- Scrydex in beta for One Piece/Riftbound

**Best For:** Growing shops, multiple game support, professional operations

**Recommendation:** ⭐⭐⭐⭐⭐ Best overall for LATAM TCG retail

---

### Scenario C: Large Multi-Game Chain (Premium)

**Setup:**
1. Scrydex Business or Enterprise tier
2. Cardmarket API partnership (contact sales)
3. Custom integrations with regional suppliers
4. Mercado Libre API for competitive intelligence

**Cost:** 💰💰💰 $300+/month + API partnership negotiations

**Benefit:** Unified global pricing, all games, enterprise support

---

## 7. IMPLEMENTATION PRIORITY MATRIX

**High Priority (Start Here):**
1. ✅ Scryfall integration (Magic support)
2. ✅ Pokémon TCG API integration (card data)
3. ✅ Mercado Libre API integration (LATAM pricing)

**Medium Priority (Phase 2):**
4. 🟡 Scrydex subscription (real-time pricing)
5. 🟡 YGOPRODeck scraping (Yu-Gi-Oh support)

**Low Priority (Later):**
6. ⏳ One Piece manual data management
7. ⏳ Cardmarket API partnership (if scaling to EU)

---

## 8. LEGAL & COMPLIANCE NOTES

### Data Licensing:
- ✅ Card metadata (names, abilities, images from APIs) - Use authorized APIs
- ✅ Pricing data aggregation - Legal if from public sources
- ⚠️ Card images - Only from official APIs or authorized resellers
- ❌ Scraping copyrighted artwork - Violates copyright

### API Terms Compliance:
- Always read and respect each API's Terms of Service
- Scryfall explicitly allows commercial use (with restrictions)
- Pokémon TCG API allows business use with registration
- Mercado Libre requires OAuth authentication
- YGOPRODeck scraping acceptable if respectful (low rate limits)

### Web Scraping Liability:
- Respect robots.txt files
- Use reasonable rate limits (not hammering servers)
- Don't scrape protected/copyrighted content
- Don't violate explicit ToS prohibitions
- Consider legal review for commercial scraping

---

## 9. SUMMARY TABLE: APIs at a Glance

| API | Free | Games | LATAM Data | Real-time Pricing | Recommendation |
|-----|------|-------|-----------|-------------------|-----------------|
| **Scryfall** | ✅ | Magic | ❌ | ❌ | Start here for Magic |
| **Pokémon TCG** | ✅ | Pokémon | ❌ | ❌ | Use for card data |
| **YGOPRODeck** | ✅ | Yu-Gi-Oh | 🟡 | 🟡 | Scrape or wait for API |
| **Scrydex** | ❌ ($29+) | Multi | ✅ | ✅ | Best hybrid option |
| **Mercado Libre API** | ✅ | Multi | ✅ | ✅ | Essential for LATAM |
| **Cardmarket** | ❌ (restricted) | Multi | 🟡 | ⏳ | EU-focused, limited LA |
| **TCGPlayer** | ❌ (geo-blocked) | Multi | ❌ | ✅ | Skip - not LATAM |

---

## 10. FINAL RECOMMENDATION FOR LATAM TCG SHOP

### Best Approach: **Hybrid Free + Scrydex**

**Phase 1 (MVP):**
- Implement Scryfall (Magic)
- Implement Pokémon TCG API (card data)
- Integrate Mercado Libre API (LATAM pricing)
- **Cost:** $0

**Phase 2 (Scale):**
- Add Scrydex subscription ($29/month minimum)
- Gain real-time pricing, historical data, One Piece support
- **Cost:** $29+/month

**Why This Works for LATAM:**
1. ✅ Covers major games (Magic, Pokémon)
2. ✅ Real local market pricing from Mercado Libre
3. ✅ Free to start, low risk
4. ✅ Scales affordably with Scrydex
5. ✅ Future-proofs with upcoming game support
6. ✅ Builds on free, reputable sources
7. ✅ No geo-blocking issues

**Avoid:**
- ❌ TCGPlayer (geo-blocked)
- ❌ Premium Cardmarket (limited LATAM coverage)
- ❌ One Piece without Scrydex (no free API)

**Timeline:**
- Week 1-2: Scryfall + Pokémon TCG API implementation
- Week 3-4: Mercado Libre API integration
- Month 2+: Evaluate Scrydex ROI, add if positive

**Expected ROI:** Better pricing accuracy → More competitive shop → Higher sales

---

**End of Report**
