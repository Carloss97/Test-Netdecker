/**
 * Quick test script to verify API pricing.
 * Run with: npm exec ts-node test-api-prices.ts
 */

import { CardDatabaseService } from './src/services/CardDatabaseService';

async function testPrices() {
  console.log('🔍 Testing API prices...\n');

  // Test Magic: The Gathering (Scryfall)
  console.log('📖 MAGIC (Scryfall):');
  try {
    const magicCards = await CardDatabaseService.getSetCards('MAGIC', 'M25');
    if (magicCards.length > 0) {
      const sample = magicCards[0];
      console.log(`  Card: ${sample.cardName}`);
      console.log(`  priceMarket: ${sample.priceMarket ?? 'UNDEFINED'}`);
      console.log(`  priceMid: ${sample.priceMid ?? 'UNDEFINED'}`);
      console.log(`  priceLow: ${sample.priceLow ?? 'UNDEFINED'}`);
    } else {
      console.log('  ❌ No cards found');
    }
  } catch (e) {
    console.error('  ❌ Error:', e);
  }

  console.log('\n🎮 POKEMON (PokémonTCG API):');
  try {
    const pokemonCards = await CardDatabaseService.getSetCards('POKEMON', 'sv05');
    if (pokemonCards.length > 0) {
      const sample = pokemonCards[0];
      console.log(`  Card: ${sample.cardName}`);
      console.log(`  priceMarket: ${sample.priceMarket ?? 'UNDEFINED'}`);
      console.log(`  priceMid: ${sample.priceMid ?? 'UNDEFINED'}`);
      console.log(`  priceLow: ${sample.priceLow ?? 'UNDEFINED'}`);
    } else {
      console.log('  ❌ No cards found');
    }
  } catch (e) {
    console.error('  ❌ Error:', e);
  }

  console.log('\n⚔️ YUGIOH (YGOPRODeck):');
  try {
    const yugiohCards = await CardDatabaseService.getSetCards('YUGIOH', 'BURST OF DESTINY');
    if (yugiohCards.length > 0) {
      const sample = yugiohCards[0];
      console.log(`  Card: ${sample.cardName}`);
      console.log(`  priceMarket: ${sample.priceMarket ?? 'UNDEFINED'}`);
      console.log(`  priceMid: ${sample.priceMid ?? 'UNDEFINED'}`);
      console.log(`  priceLow: ${sample.priceLow ?? 'UNDEFINED'}`);
    } else {
      console.log('  ❌ No cards found');
    }
  } catch (e) {
    console.error('  ❌ Error:', e);
  }

  console.log('\n☠️ ONE PIECE (OPTCGAPI):');
  try {
    const onePieceCards = await CardDatabaseService.getSetCards('ONE_PIECE', 'OP01');
    if (onePieceCards.length > 0) {
      // Show first 3 cards to see price variation
      for (let i = 0; i < Math.min(3, onePieceCards.length); i++) {
        const card = onePieceCards[i];
        console.log(`  Card ${i + 1}: ${card.cardName}`);
        console.log(`    priceMarket: ${card.priceMarket ?? 'UNDEFINED'}`);
        console.log(`    priceMid: ${card.priceMid ?? 'UNDEFINED'}`);
        console.log(`    priceLow: ${card.priceLow ?? 'UNDEFINED'}`);
      }
    } else {
      console.log('  ❌ No cards found');
    }
  } catch (e) {
    console.error('  ❌ Error:', e);
  }

  console.log('\n✅ Test complete');
  process.exit(0);
}

testPrices().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
