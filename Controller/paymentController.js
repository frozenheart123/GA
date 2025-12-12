const QRCode = require('qrcode');
const paynowUtils = require('../utils/paynow');
const cartitems = require('../models/cartitems');

exports.generatePayNowCheckout = async (req, res, next) => {
  try {
    let cart = req.session?.cart || [];
    
    // If session cart is empty and user is logged in, load from DB
    if ((!cart || !cart.length) && req.session?.user) {
      const userId = req.session.user.user_id || req.session.user.userId || req.session.user.id;
      if (userId) {
        const rows = await new Promise((resolve, reject) => {
          cartitems.getByUserId(userId, (err, result) => {
            if (err) reject(err);
            else resolve(result);
          });
        });
        if (rows && rows.length) {
          // Normalize DB rows to session cart shape
          cart = rows.map(r => ({
            price: Number(r.price || 0),
            qty: Number(r.quantity || 0)
          }));
        }
      }
    }

    const fallbackAmount =
      Number(req.query?.amount || req.body?.amount || req.session?.checkoutAmount || 0);
    const amount =
      (cart.length &&
        cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0)) ||
      fallbackAmount;
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).send('Invalid amount');
    }
    const reference = `PN${Date.now()}`.substring(0, 25);
    const payload = paynowUtils.buildPayNowPayload({
      amount,
      proxyValue: process.env.PAYNOW_PROXY_VALUE || '98590528',
      proxyType: process.env.PAYNOW_PROXY_TYPE || '0',
      merchantName: process.env.PAYNOW_MERCHANT_NAME || 'MALAMART',
      merchantCity: process.env.PAYNOW_MERCHANT_CITY || 'SINGAPORE',
      reference,
    });
    console.log('PayNow payload:', payload);
    paynowUtils.printTLV(payload);
    const paynowQr = await QRCode.toDataURL(payload);
    res.render('checkout', {
      amount: amount.toFixed(2),
      reference,
      paynowQr,
    });
  } catch (err) {
    next(err);
  }
};


