#!/bin/bash
# Test all external API endpoints to verify fixes

BASE_URL="http://localhost:3001/api"

echo "=== TCG SINGLES PLATFORM - API TEST SUITE ==="
echo ""

# Test 1: Health check
echo "1️⃣ Health Check"
curl -s "$BASE_URL/health" && echo "" || echo "❌ Health endpoint failed"
echo ""

# Test 2: List sets for each TCG
echo "2️⃣ List Sets (Magic)"
curl -s "$BASE_URL/external/sets?tcg=MAGIC" | jq -r '.total' | head -1
echo ""

echo "3️⃣ List Sets (Pokemon)"
curl -s "$BASE_URL/external/sets?tcg=POKEMON" | jq -r '.total' | head -1
echo ""

echo "4️⃣ List Sets (YuGiOh)"
curl -s "$BASE_URL/external/sets?tcg=YUGIOH" | jq -r '.total' | head -1
echo ""

echo "5️⃣ List Sets (One Piece)"
curl -s "$BASE_URL/external/sets?tcg=ONE_PIECE" | jq -r '.total' | head -1
echo ""

# Test 6: Search cards
echo "6️⃣ Search Cards (Magic: Lightning)"
curl -s "$BASE_URL/external/search?tcg=MAGIC&query=Lightning" | jq -r '.total' | head -1
echo ""

echo "7️⃣ Search Cards (Pokemon: Pikachu)"
curl -s "$BASE_URL/external/search?tcg=POKEMON&query=Pikachu" | jq -r '.total' | head -1
echo ""

echo "8️⃣ Search Cards (YuGiOh: Blue)"
curl -s "$BASE_URL/external/search?tcg=YUGIOH&query=Blue" | jq -r '.total' | head -1
echo ""

echo "9️⃣ Search Cards (One Piece: Luffy)"
curl -s "$BASE_URL/external/search?tcg=ONE_PIECE&query=Luffy" | jq -r '.total' | head -1
echo ""

echo "=== TEST COMPLETE ==="
