// backend/src/utils/validators.ts
import { CardCondition } from '@prisma/client';

export function isValidCardCondition(condition: unknown): condition is CardCondition {
  return typeof condition === 'string' && ['NM', 'LP', 'MP', 'HP', 'DMG'].includes(condition);
}

export function isValidQuantity(qty: unknown): boolean {
  return typeof qty === 'number' && qty >= 0 && Number.isInteger(qty);
}

export function isValidPrice(price: unknown): boolean {
  return typeof price === 'number' && price > 0;
}

export function isValidMargin(margin: unknown): boolean {
  return typeof margin === 'number' && margin > 0 && margin <= 5; // Max 5x markup
}

export function isValidCardCode(code: string): boolean {
  return typeof code === 'string' && code.length > 0 && code.length <= 50;
}
