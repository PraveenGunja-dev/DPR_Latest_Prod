/**
 * test-p6-token.js
 * A manual test runner for the P6 token module.
 *
 * Scenarios covered:
 *  - Generate a token (live)
 *  - Use cached token
 *  - Force refresh (clear cache)
 *  - Simulate expiry and auto-refresh
 *
 * Run:
 *   set ORACLE_P6_TOKEN_URL=https://<host>/oauth2/v1/token
 *   set ORACLE_P6_OAUTH_TOKEN=<base64 client:secret>
 *   node test-p6-token.js
 *
 * On bash:
 *   export ORACLE_P6_TOKEN_URL=...
 *   export ORACLE_P6_OAUTH_TOKEN=...
 *   node test-p6-token.js
 */

const path = require('path');
const fs = require('fs');

// Verify cert files exist early (same paths used in your module)
const certPath = 'C:/nginx/certs/cert.pem';
const keyPath  = 'C:/nginx/certs/key.pem';
if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
  console.warn('[WARN] Client certificate files not found at:');
  console.warn('       cert:', certPath);
  console.warn('       key :', keyPath);
  console.warn('       If your endpoint requires mTLS, the test will fail.\n');
}

process.on('unhandledRejection', (err) => {
  console.error('[UnhandledRejection]', err);
  process.exitCode = 1;
});

process.on('uncaughtException', (err) => {
  console.error('[UncaughtException]', err);
  process.exitCode = 1;
});

// Import your module
const {
  generateP6Token,
  getValidP6Token,
  clearCachedToken
} = require('./p6-token');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  // Quick environment checks
  const url = process.env.ORACLE_P6_TOKEN_URL;
  const auth = process.env.ORACLE_P6_OAUTH_TOKEN;

  console.log('=== ENV CHECK ===');
  console.log('ORACLE_P6_TOKEN_URL:', url || '(MISSING)');
  console.log('ORACLE_P6_OAUTH_TOKEN: ', auth ? '(SET)' : '(MISSING)');
  console.log('=================\n');

  if (!url || !auth) {
    console.error('⛔ Please set ORACLE_P6_TOKEN_URL and ORACLE_P6_OAUTH_TOKEN env vars before running.');
    console.error('   Example:');
    console.error('   set ORACLE_P6_TOKEN_URL=https://<host>/oauth2/v1/token');
    console.error('   set ORACLE_P6_OAUTH_TOKEN=<base64 client:secret>\n');
    process.exit(1);
  }

  try {
    console.log('\n[TEST 1] Generate token directly via generateP6Token()');
    const token1 = await generateP6Token();
    console.log('Token (first 20 chars):', token1.slice(0, 20) + '...\n');

    console.log('[TEST 2] Reuse cached token via getValidP6Token()');
    const token2 = await getValidP6Token();
    console.log('Same token as previous? ', token2 === token1, '\n');

    console.log('[TEST 3] Clear cache and request fresh token');
    clearCachedToken();
    const token3 = await getValidP6Token();
    console.log('New token equals old (should be often different):', token3 === token1, '\n');

    console.log('[TEST 4] Simulate expiry and auto-refresh');
    console.log('NOTE: Your module sets expiry to (expires_in - 60)s. We simulate by waiting briefly and calling twice.');
    // In real test, you could temporarily adjust the module to set expires_in to a tiny number or expose a setter.
    // Here we just call twice to demonstrate flow.
    const token4a = await getValidP6Token();
    await sleep(1000);
    const token4b = await getValidP6Token();
    console.log('Token did not change without expiry (expected true):', token4a === token4b, '\n');

    console.log('✅ All manual tests executed. Verify outputs above.');
  } catch (err) {
    console.error('\n❌ Test run failed with error:');
    if (err.response) {
      console.error('Status:', err.response.status);
      console.error('Data  :', err.response.data);
    } else {
      console.error(err.stack || err.message);
    }
    process.exitCode = 1;
  }
}

run();
