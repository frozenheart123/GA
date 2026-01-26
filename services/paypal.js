const https = require('https');
const { URL } = require('url');
require('dotenv').config();

// Simple fetch replacement using https module with redirect support
async function fetch(url, options = {}, redirectCount = 0) {
  if (redirectCount > 5) throw new Error('Too many redirects');
  
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        method: options.method || 'GET',
        hostname: u.hostname,
        path: u.pathname + (u.search || ''),
        headers: options.headers || {}
      },
      async (res) => {
        // Handle redirects (301, 302, 307, 308)
        if ([301, 302, 307, 308].includes(res.statusCode)) {
          const location = res.headers.location;
          if (!location) {
            return reject(new Error(`Redirect without location header (${res.statusCode})`));
          }
          return resolve(fetch(location, options, redirectCount + 1));
        }
        
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          const text = buf.toString('utf8');
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            statusText: res.statusMessage || '',
            json: async () => JSON.parse(text || '{}'),
            text: async () => text
          });
        });
      }
    );
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

const PAYPAL_CLIENT = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_API = process.env.PAYPAL_API;

async function parseJsonSafe(response) {
  try {
    return await response.json();
  } catch (err) {
    return { message: 'Non-JSON response from PayPal', raw: await response.text() };
  }
}

async function getAccessToken() {
  const response = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(PAYPAL_CLIENT + ':' + PAYPAL_SECRET).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  if (!response.ok) {
    const errorBody = await parseJsonSafe(response);
    throw new Error(`PayPal auth failed (${response.status} ${response.statusText}): ${JSON.stringify(errorBody)}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function createOrder(amount) {
  const accessToken = await getAccessToken();
  const response = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: 'SGD',
          value: amount
        }
      }]
    })
  });

  if (!response.ok) {
    const errorBody = await parseJsonSafe(response);
    throw new Error(`PayPal createOrder failed (${response.status} ${response.statusText}): ${JSON.stringify(errorBody)}`);
  }

  return await response.json();
}

async function captureOrder(orderId) {
  const accessToken = await getAccessToken();
  const response = await fetch(`${PAYPAL_API}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const errorBody = await parseJsonSafe(response);
    throw new Error(`PayPal captureOrder failed (${response.status} ${response.statusText}): ${JSON.stringify(errorBody)}`);
  }

  const data = await response.json();
  console.log('PayPal captureOrder response:', data);
  return data;
}

module.exports = { createOrder, captureOrder };