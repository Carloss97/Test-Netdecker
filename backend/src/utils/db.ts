// src/utils/db.ts
import { PrismaClient } from '@prisma/client';

console.log('[DB] Initializing PrismaClient...');
const prisma = new PrismaClient();
console.log('[DB] PrismaClient initialized:', prisma ? 'SUCCESS' : 'FAILED');

export default prisma;
