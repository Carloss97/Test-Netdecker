#!/usr/bin/env node
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function parseArgs(argv) {
  const options = {
    slug: 'test-netdecker',
    name: 'Test Netdecker',
    description: 'Tienda de prueba para piloto guiado',
    currency: 'CLP',
    taxRate: 0,
    email: 'test-netdecker-admin@local',
    role: 'ADMIN',
    password: '',
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;

    const [keyPart, inlineValue] = token.slice(2).split('=', 2);
    const key = keyPart.trim();
    const next = argv[index + 1];
    const hasSeparateValue = inlineValue === undefined && next !== undefined && !String(next).startsWith('--');

    if (key === 'dry-run') {
      options.dryRun = true;
      continue;
    }

    if (!hasSeparateValue && inlineValue === undefined) {
      continue;
    }

    const value = inlineValue ?? String(next);
    switch (key) {
      case 'slug':
        options.slug = value;
        break;
      case 'name':
        options.name = value;
        break;
      case 'description':
        options.description = value;
        break;
      case 'currency':
        options.currency = value.toUpperCase();
        break;
      case 'taxRate':
        options.taxRate = Number(value);
        break;
      case 'email':
        options.email = value;
        break;
      case 'role':
        options.role = value.toUpperCase();
        break;
      case 'password':
        options.password = value;
        break;
      default:
        break;
    }

    if (hasSeparateValue) {
      index += 1;
    }
  }

  return options;
}

async function scryptAsync(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derived) => {
      if (err) return reject(err);
      resolve(derived);
    });
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scryptAsync(password, salt);
  const hash = Buffer.from(derived).toString('hex');
  return { salt, hash };
}

function generatePassword() {
  return crypto.randomBytes(12).toString('base64url');
}

async function upsertStore(input) {
  const data = {
    slug: input.slug.trim().toLowerCase(),
    name: input.name.trim(),
    description: input.description?.trim() || null,
    currency: input.currency.trim().toUpperCase(),
    taxRate: Number.isFinite(input.taxRate) ? Number(input.taxRate) : 0,
  };

  const existing = await prisma.store.findUnique({ where: { slug: data.slug } });
  if (existing) {
    return prisma.store.update({
      where: { slug: data.slug },
      data,
    });
  }

  return prisma.store.create({ data });
}

async function upsertAdminUser(input) {
  const normalizedRole = ['ADMIN', 'MANAGER', 'STAFF'].includes(String(input.role).toUpperCase()) ? String(input.role).toUpperCase() : 'ADMIN';
  const { salt, hash } = await hashPassword(input.password);
  const data = {
    email: input.email.trim().toLowerCase(),
    passwordSalt: salt,
    passwordHash: hash,
    role: normalizedRole,
    isActive: true,
  };

  const existing = await prisma.adminUser.findUnique({ where: { email: data.email } });
  if (existing) {
    return prisma.adminUser.update({
      where: { email: data.email },
      data,
    });
  }

  return prisma.adminUser.create({ data });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const password = options.password || generatePassword();

  if (options.dryRun) {
    console.log('Dry run:');
    console.log(JSON.stringify({ ...options, password: options.password ? '<provided>' : '<generated>' }, null, 2));
    return;
  }

  try {
    const store = await upsertStore(options);
    const adminUser = await upsertAdminUser({
      email: options.email,
      password,
      role: options.role,
    });

    console.log(`Provisioned store ${store.name} (${store.slug})`);
    console.log(`Store ID: ${store.id}`);
    console.log(`Admin user: ${adminUser.email} (${adminUser.role})`);
    console.log(`Password: ${password}`);
    console.log('Login flow: open /login, enter the admin credentials, and paste the Store ID into the optional Store ID field.');
  } catch (err) {
    console.error('Error provisioning test store:', err && err.message ? err.message : err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();