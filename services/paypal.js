const axios = require('axios');
require('dotenv').config();

const PAYPAL_CLIENT = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_API = process.env.PAYPAL_API;

async function getAccessToken() {
  try {
    const response = await axios.post(
      `${PAYPAL_API}/v1/oauth2/token`,
      new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
      {
        headers: {
          'Authorization': 'Basic ' + Buffer.from(PAYPAL_CLIENT + ':' + PAYPAL_SECRET).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    if (!response.data.access_token) {
      console.error('PayPal auth response missing access_token:', response.data);
      throw new Error('PayPal authentication failed: No access token received');
    }
    
    return response.data.access_token;
  } catch (error) {
    console.error('PayPal authentication failed:', error.response?.status, error.response?.data);
    throw new Error(`PayPal authentication error: ${error.response?.status || error.message}. Check your PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env`);
  }
}

async function createOrder(amount) {
  try {
    const accessToken = await getAccessToken();
    const response = await axios.post(
      `${PAYPAL_API}/v2/checkout/orders`,
      {
        intent: 'CAPTURE',
        purchase_units: [{
          amount: {
            currency_code: 'SGD',
            value: amount
          }
        }]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error('PayPal createOrder HTTP error:', error.response?.status, error.response?.data);
    throw new Error(`PayPal API error: ${error.response?.status || error.message} - ${JSON.stringify(error.response?.data)}`);
  }
}

async function captureOrder(orderId) {
  try {
    const accessToken = await getAccessToken();
    const response = await axios.post(
      `${PAYPAL_API}/v2/checkout/orders/${orderId}/capture`,
      null,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );
    const data = response.data;
    console.log('PayPal captureOrder response:', data);
    return data;
  } catch (error) {
    console.error('PayPal captureOrder HTTP error:', error.response?.status, error.response?.data);
    throw new Error(`PayPal API error: ${error.response?.status || error.message} - ${JSON.stringify(error.response?.data)}`);
  }
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
  const response = await axios.post(
    url,
    body || null,
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      }
    }
  );
  return response.data;
}

module.exports.refundPayment = refundPayment;
