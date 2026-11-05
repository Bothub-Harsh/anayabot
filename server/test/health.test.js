const assert = require('assert');
const http = require('http');

process.env.PORT = '3099';
process.env.NODE_ENV = 'production';

require('../src/index');

setTimeout(() => {
  http.get('http://127.0.0.1:3099/health', (res) => {
    let raw = '';
    res.on('data', chunk => raw += chunk);
    res.on('end', () => {
      console.log('HTTP Status:', res.statusCode);
      const json = JSON.parse(raw);
      console.log('Health Response:', json);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(json.status, 'ok');
      assert.ok('database' in json);
      assert.ok('uptime' in json);
      assert.ok('version' in json);
      console.log('✅ PASS: Health check endpoint functions correctly in production mode');
      process.exit(0);
    });
  }).on('error', (err) => {
    console.error('Health check failed:', err);
    process.exit(1);
  });
}, 1500);

