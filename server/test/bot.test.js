const assert = require('assert');
const { isValidHttpsUrl, getValidWebAppUrl } = require('../src/bot/bot');

console.log('🧪 Starting Telegram Bot URL & Button Verification Tests...\n');

let passed = 0;
let failed = 0;

function test(description, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${description}`);
    passed++;
  } catch (err) {
    console.error(`❌ FAIL: ${description}`);
    console.error(err);
    failed++;
  }
}

// 1. Localhost HTTP rejected
test('1. Rejects http://localhost:5173', () => {
  assert.strictEqual(isValidHttpsUrl('http://localhost:5173'), false);
});

// 2. Localhost HTTPS rejected
test('2. Rejects https://localhost:5173', () => {
  assert.strictEqual(isValidHttpsUrl('https://localhost:5173'), false);
});

// 3. Loopback IP rejected
test('3. Rejects http://127.0.0.1:5173 and https://127.0.0.1:5173', () => {
  assert.strictEqual(isValidHttpsUrl('http://127.0.0.1:5173'), false);
  assert.strictEqual(isValidHttpsUrl('https://127.0.0.1:5173'), false);
});

// 4. Invalid protocols rejected
test('4. Rejects non-https protocols', () => {
  assert.strictEqual(isValidHttpsUrl('ftp://example.com'), false);
  assert.strictEqual(isValidHttpsUrl('javascript:void(0)'), false);
  assert.strictEqual(isValidHttpsUrl('not-a-url'), false);
  assert.strictEqual(isValidHttpsUrl(''), false);
  assert.strictEqual(isValidHttpsUrl(null), false);
});

// 5. Valid public HTTPS URLs accepted
test('5. Accepts valid public HTTPS URLs (Ngrok, Render, Custom domains)', () => {
  assert.strictEqual(isValidHttpsUrl('https://ludo-arena-test.ngrok-free.app'), true);
  assert.strictEqual(isValidHttpsUrl('https://ludo-arena.onrender.com'), true);
  assert.strictEqual(isValidHttpsUrl('https://gaming.example.com/app'), true);
});

// 6. getValidWebAppUrl behaves correctly with process.env.WEB_APP_URL
test('6. getValidWebAppUrl handles unset or invalid WEB_APP_URL gracefully', () => {
  delete process.env.WEB_APP_URL;
  assert.strictEqual(getValidWebAppUrl(), null);

  process.env.WEB_APP_URL = 'http://localhost:5173';
  assert.strictEqual(getValidWebAppUrl(), null);
});

test('7. getValidWebAppUrl correctly constructs query params on valid HTTPS', () => {
  process.env.WEB_APP_URL = 'https://ludo-arena-test.ngrok-free.app';
  assert.strictEqual(getValidWebAppUrl(), 'https://ludo-arena-test.ngrok-free.app');
  assert.strictEqual(getValidWebAppUrl('?page=spectate'), 'https://ludo-arena-test.ngrok-free.app?page=spectate');
  assert.strictEqual(getValidWebAppUrl('?join=ABC123'), 'https://ludo-arena-test.ngrok-free.app?join=ABC123');
});

console.log(`\n========================================`);
console.log(`Bot Test Results: ${passed} Passed, ${failed} Failed`);
console.log(`========================================\n`);

if (failed > 0) process.exit(1);

