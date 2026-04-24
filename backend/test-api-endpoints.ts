#!/usr/bin/env node
/**
 * Test API Endpoints with Test Data
 * 
 * This script tests the API endpoints with the test data created
 * Run with: npx tsx test-api-endpoints.ts
 */

async function testAPI() {
  const BASE_URL = 'http://localhost:3333';
  
  // Test tokens from create-test-data.ts
  const ADMIN_TOKEN = 'test-token-admin-447d57f0-945d-4bb3-9433-781336fcf714';
  const STORE_ID = 'cmoc874qx00003w2ietjkl09o'; // Tienda Principal

  console.log('🧪 Testing API Endpoints\n');
  console.log(`Base URL: ${BASE_URL}\n`);

  try {
    // Test 1: Public endpoint - List all available listings
    console.log('📝 Test 1: GET /api/listings/available (public)');
    const res1 = await fetch(`${BASE_URL}/api/listings/available?tcgId=MAGIC`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    const data1 = await res1.json();
    console.log(`Status: ${res1.status}`);
    if (data1.success) {
      console.log(`✓ Found ${data1.data?.length || 0} MAGIC listings across all stores\n`);
    } else {
      console.log(`✗ Error: ${data1.error?.message}\n`);
    }

    // Test 2: List listings for Store 1
    console.log('📝 Test 2: GET /api/listings/available (Store 1 only)');
    const res2 = await fetch(`${BASE_URL}/api/listings/available?tcgId=MAGIC`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'x-store-id': STORE_ID
      }
    });
    const data2 = await res2.json();
    console.log(`Status: ${res2.status}`);
    if (data2.success) {
      console.log(`✓ Found ${data2.data?.length || 0} MAGIC listings in Store 1\n`);
      if (data2.data && data2.data.length > 0) {
        console.log(`  Sample listing: ${data2.data[0].cardName} - Qty: ${data2.data[0].quantity}`);
      }
    } else {
      console.log(`✗ Error: ${data2.error?.message}\n`);
    }

    // Test 3: Admin endpoint - Price volatility
    console.log('\n📝 Test 3: GET /api/admin/price-volatility (admin only)');
    const res3 = await fetch(`${BASE_URL}/api/admin/price-volatility?limit=10`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'x-admin-token': ADMIN_TOKEN
      }
    });
    const data3 = await res3.json();
    console.log(`Status: ${res3.status}`);
    if (data3.success) {
      console.log(`✓ Found ${data3.total || 0} volatile price events\n`);
      if (data3.events && data3.events.length > 0) {
        console.log(`  Sample event: ${data3.events[0].cardName} (${data3.events[0].editionCode})`);
        console.log(`               ${data3.events[0].oldPrice} → ${data3.events[0].newPrice} USD`);
      }
    } else {
      console.log(`✗ Error: ${data3.error?.message}\n`);
    }

    // Test 4: Admin endpoint - List stores
    console.log('\n📝 Test 4: GET /api/admin/stores (admin only)');
    const res4 = await fetch(`${BASE_URL}/api/admin/stores`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'x-admin-token': ADMIN_TOKEN
      }
    });
    const data4 = await res4.json();
    console.log(`Status: ${res4.status}`);
    if (data4.success) {
      console.log(`✓ Found ${data4.stores?.length || 0} stores\n`);
      if (data4.stores) {
        data4.stores.forEach((store: any) => {
          console.log(`  - ${store.name} (${store.slug})`);
        });
      }
    } else {
      console.log(`✗ Error: ${data4.error?.message}\n`);
    }

    // Test 5: Without auth header (should fail)
    console.log('\n📝 Test 5: GET /api/admin/stores (without auth - should fail)');
    const res5 = await fetch(`${BASE_URL}/api/admin/stores`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    const data5 = await res5.json();
    console.log(`Status: ${res5.status}`);
    if (!data5.success) {
      console.log(`✓ Correctly rejected: ${data5.error?.message}\n`);
    } else {
      console.log(`✗ Should have failed but got: ${JSON.stringify(data5)}\n`);
    }

    console.log('═══════════════════════════════════════════════════');
    console.log('✅ API Testing Complete!');
    console.log('═══════════════════════════════════════════════════');
    console.log('\n📊 Summary:');
    console.log(`  - Public endpoints working: ${res1.ok && res2.ok ? '✓' : '✗'}`);
    console.log(`  - Admin endpoints working: ${res3.ok && res4.ok ? '✓' : '✗'}`);
    console.log(`  - Auth protection working: ${res5.status === 401 ? '✓' : '✗'}`);

  } catch (error: any) {
    console.error('\n❌ Test Error:', error.message);
    console.error('\n💡 Make sure the backend is running:');
    console.error('   npm --prefix backend run dev');
  }
}

testAPI();
