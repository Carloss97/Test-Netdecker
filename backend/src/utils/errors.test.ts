import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ApplicationError,
  NotFoundError,
  ValidationError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
} from '../utils/errors.js';

// ────────────────────────────────────────────────────────────────────────────
// ApplicationError
// ────────────────────────────────────────────────────────────────────────────

test('ApplicationError stores statusCode and message', () => {
  const err = new ApplicationError(418, "I'm a teapot");
  assert.equal(err.statusCode, 418);
  assert.equal(err.message, "I'm a teapot");
  assert.equal(err.name, 'ApplicationError');
});

test('ApplicationError has default code INTERNAL_ERROR', () => {
  const err = new ApplicationError(500, 'oops');
  assert.equal(err.code, 'INTERNAL_ERROR');
});

test('ApplicationError accepts custom code', () => {
  const err = new ApplicationError(422, 'invalid', 'CUSTOM_CODE');
  assert.equal(err.code, 'CUSTOM_CODE');
});

// ────────────────────────────────────────────────────────────────────────────
// NotFoundError
// ────────────────────────────────────────────────────────────────────────────

test('NotFoundError has statusCode 404 and code NOT_FOUND', () => {
  const err = new NotFoundError('Resource missing');
  assert.equal(err.statusCode, 404);
  assert.equal(err.code, 'NOT_FOUND');
  assert.equal(err.message, 'Resource missing');
  assert.equal(err.name, 'NotFoundError');
});

test('NotFoundError is instance of ApplicationError', () => {
  const err = new NotFoundError('x');
  assert.ok(err instanceof ApplicationError);
  assert.ok(err instanceof Error);
});

// ────────────────────────────────────────────────────────────────────────────
// ValidationError
// ────────────────────────────────────────────────────────────────────────────

test('ValidationError has statusCode 400 and code VALIDATION_ERROR', () => {
  const err = new ValidationError('bad input');
  assert.equal(err.statusCode, 400);
  assert.equal(err.code, 'VALIDATION_ERROR');
  assert.equal(err.name, 'ValidationError');
});

// ────────────────────────────────────────────────────────────────────────────
// ConflictError
// ────────────────────────────────────────────────────────────────────────────

test('ConflictError has statusCode 409 and code CONFLICT', () => {
  const err = new ConflictError('duplicate');
  assert.equal(err.statusCode, 409);
  assert.equal(err.code, 'CONFLICT');
  assert.equal(err.name, 'ConflictError');
});

// ────────────────────────────────────────────────────────────────────────────
// UnauthorizedError
// ────────────────────────────────────────────────────────────────────────────

test('UnauthorizedError has statusCode 401 and default message', () => {
  const err = new UnauthorizedError();
  assert.equal(err.statusCode, 401);
  assert.equal(err.code, 'UNAUTHORIZED');
  assert.equal(err.message, 'Unauthorized');
});

test('UnauthorizedError accepts custom message', () => {
  const err = new UnauthorizedError('Token expired');
  assert.equal(err.message, 'Token expired');
});

// ────────────────────────────────────────────────────────────────────────────
// ForbiddenError
// ────────────────────────────────────────────────────────────────────────────

test('ForbiddenError has statusCode 403 and default message', () => {
  const err = new ForbiddenError();
  assert.equal(err.statusCode, 403);
  assert.equal(err.code, 'FORBIDDEN');
  assert.equal(err.message, 'Forbidden');
});

test('ForbiddenError accepts custom message', () => {
  const err = new ForbiddenError('Access denied');
  assert.equal(err.message, 'Access denied');
});
