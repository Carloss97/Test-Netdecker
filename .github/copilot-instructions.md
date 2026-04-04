# .github/copilot-instructions.md

## TCG Singles Platform - Development Guide

### Project Structure

This is a fullstack monorepo with:
- **Backend**: Node.js/Express/TypeScript with Prisma ORM
- **Frontend**: React + Vite + TypeScript
- **Database**: PostgreSQL
- **Cache**: Redis

### Key Architecture

1. **Services Layer**: All business logic (PriceService, CardService, ListingService, TCGService, ExchangeRateService, EditionService)
2. **Routes Layer**: Express routes that delegate to services
3. **Database**: Prisma ORM with PostgreSQL
4. **Cache**: Redis for exchange rates and frequently accessed data

### Development Rules

- Always add TypeScript types
- Use Prisma services for database operations
- Cache external API calls (exchange rates, TCGplayer data)
- Validate input with Zod or manual checks
- Return JSON responses with consistent format
- Handle errors gracefully with try-catch

### Common Tasks

**Add a new API endpoint:**
1. Create service method in `backend/src/services/`
2. Add route in `backend/src/routes/`
3. Update Frontend `catalog.ts` if needed

**Update database schema:**
1. Modify `backend/prisma/schema.prisma`
2. Run `npm run prisma:push`

**Add inventory (CSV):**
1. Create parser in `backend/src/services/InventoryService.ts`
2. Add POST endpoint in `backend/src/routes/inventory.routes.ts`

### Price Update Logic

- Call `PriceService.updateListingPrice()` to update prices
- It automatically creates history records
- Use `PriceService.isVolatileChange()` to check for suspicious jumps
- Sync job queries TCGplayer and updates every 4-6 hours

### Default Data

TCGs initialize automatically:
- MAGIC: Magic: The Gathering
- POKEMON: Pokémon Trading Card Game
- YUGIOH: Yu-Gi-Oh!
- ONE_PIECE: One Piece Trading Card Game

