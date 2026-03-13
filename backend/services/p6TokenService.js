const axios = require('axios');
const qs = require('qs');
const fs = require('fs');
const https = require('https');

// ENV
const P6_TOKEN_URL = process.env.ORACLE_P6_TOKEN_URL;
const P6_AUTH_TOKEN = process.env.ORACLE_P6_OAUTH_TOKEN; // base64 client:secret

const { HttpsProxyAgent } = require('https-proxy-agent');

// Helper to get agent based on proxy settings for preventing ECONNRESET
const getHttpsAgent = () => {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.http_proxy;

  if (proxyUrl) {
    console.log(`[P6 Token] Using Proxy Agent: ${proxyUrl}`);
    // Proxy agent automatically handles the CONNECT method for tunneling
    // rejectingUnauthorized: false is still needed if the proxy intercepts SSL (common in corporate)
    return new HttpsProxyAgent(proxyUrl, {
      rejectUnauthorized: false
    });
  }

  // Direct connection with permissive SSL
  return new https.Agent({
    rejectUnauthorized: false
  });
};

const httpsAgent = getHttpsAgent();

// Token cache
let cachedToken = null;
let tokenExpiresAt = null;

/**
 * Generate OAuth token from Oracle P6
 */
/**
 * Generate OAuth token from Oracle P6
 */
async function generateP6Token() {
  try {
    const tokenUrl = process.env.ORACLE_P6_TOKEN_URL;
    const basicAuth = process.env.ORACLE_P6_OAUTH_TOKEN;

    console.log('[P6 Token] Generating new token from Oracle P6...');

    // Decode User/Pass from the provided Basic Auth string
    let username, password;
    try {
      const decoded = Buffer.from(basicAuth, 'base64').toString('utf8');
      const parts = decoded.split(':');
      username = parts[0];
      password = parts.slice(1).join(':');
    } catch (e) {
      throw new Error(`Invalid Base64 in ORACLE_P6_OAUTH_TOKEN: ${e.message}`);
    }

    // Use Password Grant (Public Client flow)
    // Sending credentials in BODY, ignoring provided Basic Auth header for client
    const params = new URLSearchParams();
    params.append('grant_type', 'password');
    params.append('username', username);
    params.append('password', password);
    params.append('scope', 'urn:opc:idm:__myscopes__');

    const response = await axios.post(tokenUrl, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      httpsAgent,
      timeout: 30000
    });

    // Check behavior: IDCS sometimes returns raw JWT string, sometimes { access_token: ... }
    let token;
    let expires_in = 3600; // Default 1 hour if not specified

    if (typeof response.data === 'string' && response.data.startsWith('ey')) {
      // Raw JWT token returned
      token = response.data.trim();
      console.log('[P6 Token] Received raw JWT token string');
    } else if (typeof response.data === 'object') {
      // Standard JSON response
      token = (response.data.access_token || response.data.authToken)?.trim();
      if (response.data.expires_in) expires_in = response.data.expires_in;
      if (response.data.token_exp) expires_in = response.data.token_exp;
    }

    if (!token) {
      console.error('[P6 Token] Response type:', typeof response.data);
      console.error('[P6 Token] Response preview:', JSON.stringify(response.data).substring(0, 100));
      throw new Error('No access_token, authToken, or raw JWT found in response');
    }

    cachedToken = token;
    tokenExpiresAt = Date.now() + (expires_in - 60) * 1000;

    console.log(`[P6 Token] Token generated successfully. Expires in ${expires_in}s`);
    return token;

  } catch (error) {
    console.error('[P6 Token] Error generating token:', error.message);

    if (error.response) {
      console.error('[P6 Token] Status:', error.response.status);
      console.error('[P6 Token] Data:', error.response.data);
    }

    throw error;
  }
}

/**
 * Get valid token
 */
async function getValidP6Token() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    console.log('[P6 Token] Using cached token');
    return cachedToken;
  }
  return await generateP6Token();
}

function clearCachedToken() {
  cachedToken = null;
  tokenExpiresAt = null;
}

module.exports = {
  generateP6Token,
  getValidP6Token,
  clearCachedToken
};
