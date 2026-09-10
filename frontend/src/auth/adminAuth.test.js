import test from 'node:test';
import assert from 'node:assert/strict';
import { isAdminCredentials } from './adminAuth.js';

test('recognizes the configured admin login', () => {
  assert.equal(
    isAdminCredentials('gitrepo02@gmail.com', 'adminpassword123'),
    true,
  );
});

test('rejects non-admin user credentials', () => {
  assert.equal(
    isAdminCredentials('user@gmail.com', 'password123'),
    false,
  );
});
