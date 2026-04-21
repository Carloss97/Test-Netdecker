#!/usr/bin/env node
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function scryptAsync(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derived) => {
      if (err) return reject(err);
      resolve(derived);
    });
  });
}

async function main() {
  const [,, email, password] = process.argv;
  if (!email || !password) {
    console.error('usage: node create-admin.mjs email password');
    process.exit(2);
  }

  try {
    const existing = await prisma.adminUser.findUnique({ where: { email } });
    if (existing) {
      console.error('Admin user already exists:', existing.email);
      process.exit(3);
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const derived = await scryptAsync(password, salt);
    const hash = Buffer.from(derived).toString('hex');

    const user = await prisma.adminUser.create({
      data: {
        email,
        passwordHash: hash,
        passwordSalt: salt,
        role: 'ADMIN',
        isActive: true,
      }
    });

    console.log('Created admin', user.id, user.email);
  } catch (err) {
    console.error('Error creating admin:', err && err.message ? err.message : err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
