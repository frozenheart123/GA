const fetch = require('node-fetch');
require('dotenv').config();

const PAYPAL_CLIENT = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_API = process.env.PAYPAL_API;

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
    const errorText = await response.text();
    console.error('PayPal authentication failed:', response.status, errorText);
    throw new Error(`PayPal authentication error: ${response.status}. Check your PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env`);
  }
  
  const data = await response.json();
  
  if (!data.access_token) {
    console.error('PayPal auth response missing access_token:', data);
    throw new Error('PayPal authentication failed: No access token received');
  }
  
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
    const errorText = await response.text();
    console.error('PayPal createOrder HTTP error:', response.status, errorText);
    throw new Error(`PayPal API error: ${response.status} - ${errorText}`);
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
    const errorText = await response.text();
    console.error('PayPal captureOrder HTTP error:', response.status, errorText);
    throw new Error(`PayPal API error: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json();
  console.log('PayPal captureOrder response:', data);
  return data;
}

module.exports = { createOrder, captureOrder };
/**
 * Refund a PayPal payment by capture ID
 * @param {string} captureId - The PayPal capture ID to refund
 * @param {string|number} [amount] - Optional amount to refund (if not full)
 * @returns {Promise<object>} PayPal refund response
 */
async function refundPayment(captureId, amount) {
  const accessToken = await getAccessToken();
  const url = `${PAYPAL_API}/v2/payments/captures/${captureId}/refund`;
  const body = amount ? {
    amount: {
      value: String(amount),
      currency_code: 'SGD'
    }
  } : undefined;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json();
  return data;
}

module.exports.refundPayment = refundPayment;