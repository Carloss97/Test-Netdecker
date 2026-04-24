#!/usr/bin/env node
/**
 * backend/scripts/create-test-data.ts
 * 
 * Creates test stores, admin user, and sample data for testing
 * Run with: npx tsx scripts/create-test-data.ts
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID, randomBytes, scryptSync } from 'crypto';

// Load .env
dotenv.config({ path: '.env' });

// Import Prisma
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use randomUUID instead of uuid package
const uuidv4 = () => randomUUID();

// Helper to hash password (same as AdminAuthService)
async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 32).toString('hex');
  return { hash, salt };
}

async function main() {
  console.log('🧪 Creating test data...\n');

  try {
    // ============================================
    // 1. CREATE STORES
    // ============================================
    console.log('📦 Creating test stores...');
    
    const store1 = await prisma.store.upsert({
      where: { slug: 'tienda-principal' },
      update: {},
      create: {
        slug: 'tienda-principal',
        name: 'Tienda Principal',
        description: 'Tienda Principal de Prueba',
        currency: 'CLP',
      }
    });
    console.log(`  ✓ Store 1: ${store1.name} (${store1.id})`);

    const store2 = await prisma.store.upsert({
      where: { slug: 'tienda-secundaria' },
      update: {},
      create: {
        slug: 'tienda-secundaria',
        name: 'Tienda Secundaria',
        description: 'Tienda Secundaria de Prueba',
        currency: 'CLP',
      }
    });
    console.log(`  ✓ Store 2: ${store2.name} (${store2.id})`);

    const store3 = await prisma.store.upsert({
      where: { slug: 'tienda-test' },
      update: {},
      create: {
        slug: 'tienda-test',
        name: 'Test Store',
        description: 'Test Store Online',
        currency: 'CLP',
      }
    });
    console.log(`  ✓ Store 3: ${store3.name} (${store3.id})\n`);

    // ============================================
    // 2. CREATE ADMIN USERS
    // ============================================
    console.log('👤 Creating admin users...');
    
    const { hash: hash1, salt: salt1 } = await hashPassword('Admin123!');
    
    const admin1 = await prisma.adminUser.upsert({
      where: { email: 'admin@test.com' },
      update: {},
      create: {
        email: 'admin@test.com',
        passwordHash: hash1,
        passwordSalt: salt1,
        role: 'ADMIN',
        isActive: true,
      }
    });
    console.log(`  ✓ Admin: ${admin1.email} (${admin1.role})`);

    const { hash: hash2, salt: salt2 } = await hashPassword('Admin123!');
    
    const admin2 = await prisma.adminUser.upsert({
      where: { email: 'manager@test.com' },
      update: {},
      create: {
        email: 'manager@test.com',
        passwordHash: hash2,
        passwordSalt: salt2,
        role: 'MANAGER',
        isActive: true,
      }
    });
    console.log(`  ✓ Manager: ${admin2.email} (${admin2.role})\n`);

    // ============================================
    // 3. CREATE ADMIN SESSIONS (for testing)
    // ============================================
    console.log('🔐 Creating admin sessions...');
    
    const tokenAdmin = `test-token-admin-${randomUUID()}`;
    const sessionAdmin = await prisma.adminSession.upsert({
      where: { token: tokenAdmin },
      update: {},
      create: {
        token: tokenAdmin,
        user: { connect: { id: admin1.id } },
        store: { connect: { id: store1.id } },
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      }
    });
    console.log(`  ✓ Admin Session: ${tokenAdmin}`);

    const tokenManager = `test-token-manager-${randomUUID()}`;
    const sessionManager = await prisma.adminSession.upsert({
      where: { token: tokenManager },
      update: {},
      create: {
        token: tokenManager,
        user: { connect: { id: admin2.id } },
        store: { connect: { id: store2.id } },
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      }
    });
    console.log(`  ✓ Manager Session: ${tokenManager}\n`);

    // ============================================
    // 4. CREATE SAMPLE TCGS (if not exist)
    // ============================================
    console.log('🎮 Ensuring TCGs exist...');
    
    const mtg = await prisma.tCG.upsert({
      where: { name: 'MAGIC' },
      update: {},
      create: {
        name: 'MAGIC',
        displayName: 'Magic: The Gathering',
        description: 'The world\'s first trading card game',
      }
    });
    console.log(`  ✓ TCG: ${mtg.displayName}`);

    const pokemon = await prisma.tCG.upsert({
      where: { name: 'POKEMON' },
      update: {},
      create: {
        name: 'POKEMON',
        displayName: 'Pokémon TCG',
        description: 'Catch \'em all!',
      }
    });
    console.log(`  ✓ TCG: ${pokemon.displayName}\n`);

    // ============================================
    // 5. CREATE SAMPLE EDITIONS
    // ============================================
    console.log('📚 Creating sample editions...');
    
    const edition1 = await prisma.edition.upsert({
      where: { 
        tcgId_editionCode: {
          tcgId: mtg.id,
          editionCode: 'LEA'
        }
      },
      update: {},
      create: {
        editionCode: 'LEA',
        editionName: 'Limited Edition Alpha',
        tcgId: mtg.id,
        releaseDate: new Date('1993-08-05'),
      }
    });
    console.log(`  ✓ Edition: ${edition1.editionName} (${edition1.editionCode})`);

    const edition2 = await prisma.edition.upsert({
      where: {
        tcgId_editionCode: {
          tcgId: pokemon.id,
          editionCode: 'PS'
        }
      },
      update: {},
      create: {
        editionCode: 'PS',
        editionName: 'Base Set',
        tcgId: pokemon.id,
        releaseDate: new Date('1999-01-09'),
      }
    });
    console.log(`  ✓ Edition: ${edition2.editionName} (${edition2.editionCode})\n`);

    // ============================================
    // 6. CREATE SAMPLE CARDS
    // ============================================
    console.log('🃏 Creating sample cards...');
    
    const card1 = await prisma.card.upsert({
      where: { 
        tcgId_editionId_cardCode_rarity: {
          tcgId: mtg.id,
          editionId: edition1.id,
          cardCode: 'LEA-001',
          rarity: 'U'
        }
      },
      update: {},
      create: {
        tcgId: mtg.id,
        editionId: edition1.id,
        cardCode: 'LEA-001',
        cardName: 'Lightning Bolt',
        cardNumber: '1',
        rarity: 'U',
        colorIdentity: 'R',
      }
    });
    console.log(`  ✓ Card: ${card1.cardName}`);

    const card2 = await prisma.card.upsert({
      where: {
        tcgId_editionId_cardCode_rarity: {
          tcgId: mtg.id,
          editionId: edition1.id,
          cardCode: 'LEA-002',
          rarity: 'R'
        }
      },
      update: {},
      create: {
        tcgId: mtg.id,
        editionId: edition1.id,
        cardCode: 'LEA-002',
        cardName: 'Black Lotus',
        cardNumber: '2',
        rarity: 'R',
      }
    });
    console.log(`  ✓ Card: ${card2.cardName}`);

    const card3 = await prisma.card.upsert({
      where: {
        tcgId_editionId_cardCode_rarity: {
          tcgId: pokemon.id,
          editionId: edition2.id,
          cardCode: 'PS-001',
          rarity: 'R'
        }
      },
      update: {},
      create: {
        tcgId: pokemon.id,
        editionId: edition2.id,
        cardCode: 'PS-001',
        cardName: 'Charizard',
        cardNumber: '4/102',
        rarity: 'R',
      }
    });
    console.log(`  ✓ Card: ${card3.cardName}\n`);

    // ============================================
    // 7. CREATE SAMPLE LISTINGS (Store 1)
    // ============================================
    console.log('📦 Creating sample listings for Store 1...');
    
    const listing1 = await prisma.listing.upsert({
      where: { 
        cardId_condition_rarity: {
          cardId: card1.id,
          condition: 'NM',
          rarity: 'U'
        }
      },
      update: {},
      create: {
        cardId: card1.id,
        storeId: store1.id,
        editionId: edition1.id,
        condition: 'NM',
        rarity: 'U',
        quantity: 5,
        referencePrice: 50, // USD
        marginMultiplier: 1.2,
        finalPrice: 60, // 50 * 1.2
        status: 'active',
      }
    });
    console.log(`  ✓ Listing: ${card1.cardName} - Qty: 5 @ $50 USD`);

    const listing2 = await prisma.listing.upsert({
      where: {
        cardId_condition_rarity: {
          cardId: card2.id,
          condition: 'LP',
          rarity: 'R'
        }
      },
      update: {},
      create: {
        cardId: card2.id,
        storeId: store1.id,
        editionId: edition1.id,
        condition: 'LP',
        rarity: 'R',
        quantity: 2,
        referencePrice: 5000,
        marginMultiplier: 1.15,
        finalPrice: 5750, // 5000 * 1.15
        status: 'active',
      }
    });
    console.log(`  ✓ Listing: ${card2.cardName} - Qty: 2 @ $5000 USD\n`);

    // ============================================
    // 8. CREATE SAMPLE LISTINGS (Store 2)
    // ============================================
    console.log('📦 Creating sample listings for Store 2...');
    
    const listing3 = await prisma.listing.upsert({
      where: {
        cardId_condition_rarity: {
          cardId: card1.id,
          condition: 'NM',
          rarity: 'U'
        }
      },
      update: {},
      create: {
        cardId: card1.id,
        storeId: store2.id,
        editionId: edition1.id,
        condition: 'NM',
        rarity: 'U',
        quantity: 3,
        referencePrice: 50,
        marginMultiplier: 1.3, // Different margin!
        finalPrice: 65, // 50 * 1.3
        status: 'active',
      }
    });
    console.log(`  ✓ Listing: ${card1.cardName} - Qty: 3 @ $50 USD (1.3x margin)`);

    const listing4 = await prisma.listing.upsert({
      where: {
        cardId_condition_rarity: {
          cardId: card3.id,
          condition: 'NM',
          rarity: 'R'
        }
      },
      update: {},
      create: {
        cardId: card3.id,
        storeId: store2.id,
        editionId: edition2.id,
        condition: 'NM',
        rarity: 'R',
        quantity: 10,
        referencePrice: 100,
        marginMultiplier: 1.25,
        finalPrice: 125, // 100 * 1.25
        status: 'active',
      }
    });
    console.log(`  ✓ Listing: ${card3.cardName} - Qty: 10 @ $100 USD\n`);

    // ============================================
    // 9. CREATE PRICE HISTORY (for testing volatility)
    // ============================================
    console.log('📊 Creating price history samples...');
    
    const history1 = await prisma.priceHistory.create({
      data: {
        listingId: listing1.id,
        oldPrice: 48,
        newPrice: 50,
        percentChange: 4.2,
        reason: 'VOLATILE_ALERT',
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      }
    });
    console.log(`  ✓ Price History: ${card1.cardName} (Store 1) - 48 → 50 USD`);

    const history2 = await prisma.priceHistory.create({
      data: {
        listingId: listing3.id,
        oldPrice: 49,
        newPrice: 50,
        percentChange: 2.0,
        reason: 'EXTERNAL_API_SYNC',
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      }
    });
    console.log(`  ✓ Price History: ${card1.cardName} (Store 2) - 49 → 50 USD\n`);

    // ============================================
    // 10. SUMMARY
    // ============================================
    console.log('✅ Test data created successfully!\n');
    console.log('═══════════════════════════════════════════════════');
    console.log('🏪 STORES:');
    console.log(`  1. ${store1.name} (${store1.id})`);
    console.log(`  2. ${store2.name} (${store2.id})`);
    console.log(`  3. ${store3.name} (${store3.id})`);
    console.log('\n👤 ADMIN USERS:');
    console.log(`  - Email: admin@test.com | Password: Admin123! | Role: ADMIN`);
    console.log(`  - Email: manager@test.com | Password: Admin123! | Role: MANAGER`);
    console.log('\n🔐 TOKENS (for API testing):');
    console.log(`  ADMIN TOKEN: ${tokenAdmin}`);
    console.log(`  MANAGER TOKEN: ${tokenManager}`);
    console.log('\n📊 CARDS & LISTINGS:');
    console.log(`  - ${card1.cardName}: 5x @ Store 1, 3x @ Store 2`);
    console.log(`  - ${card2.cardName}: 2x @ Store 1`);
    console.log(`  - ${card3.cardName}: 10x @ Store 2`);
    console.log('\n═══════════════════════════════════════════════════');
    console.log('\n🧪 Next: Test the API with these commands:\n');
    console.log(`# 1. List all available listings (public endpoint)`);
    console.log(`curl -X GET "http://localhost:3333/api/listings/available?tcgId=MAGIC"`);
    console.log(`\n# 2. List listings for Store 1`);
    console.log(`curl -X GET "http://localhost:3333/api/listings/available?tcgId=MAGIC" \\`);
    console.log(`  -H "x-store-id: ${store1.id}"`);
    console.log(`\n# 3. List price volatility (admin only)`);
    console.log(`curl -X GET "http://localhost:3333/api/admin/price-volatility" \\`);
    console.log(`  -H "x-admin-token: ${tokenAdmin}"`);
    console.log(`\n# 4. View stores`);
    console.log(`curl -X GET "http://localhost:3333/api/admin/stores" \\`);
    console.log(`  -H "x-admin-token: ${tokenAdmin}"`);
    console.log('\n');

  } catch (error) {
    console.error('❌ Error creating test data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
