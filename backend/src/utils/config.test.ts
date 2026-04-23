import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('accepts a valid postgres config', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      PORT: '3333',
      DATABASE_URL: 'postgresql://user:password@localhost:5432/tcg_singles_db',
      REDIS_URL: 'redis://localhost:6379',
      STRIPE_SECRET: 'sk_test_1234567890',
    } as NodeJS.ProcessEnv);

    assert.equal(config.NODE_ENV, 'production');
    assert.equal(config.PORT, 3333);
    assert.equal(config.DATABASE_URL, 'postgresql://user:password@localhost:5432/tcg_singles_db');
  });

  it('rejects a missing database url', () => {
    assert.throws(() => {
      loadConfig({
        NODE_ENV: 'test',
        PORT: '3333',
      } as NodeJS.ProcessEnv);
    }, /DATABASE_URL/);
  });

  it('rejects malformed database and redis urls', () => {
    assert.throws(() => {
      loadConfig({
        NODE_ENV: 'development',
        PORT: '3333',
        DATABASE_URL: 'mysql://localhost:3306/tcg_singles_db',
        REDIS_URL: 'http://localhost:6379',
      } as NodeJS.ProcessEnv);
    }, /DATABASE_URL|REDIS_URL/);
  });

  it('allows sqlite when explicitly enabled', () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      PORT: '3333',
      USE_SQLITE: 'true',
      DATABASE_URL: 'file:./dev.sqlite',
    } as NodeJS.ProcessEnv);

    assert.equal(config.USE_SQLITE, true);
    assert.equal(config.DATABASE_URL, 'file:./dev.sqlite');
  });
});