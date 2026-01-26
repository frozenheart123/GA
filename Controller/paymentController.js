const cartitems = require('../models/cartitems');
const { computeCartTotals, ensureCart } = require('./cartController');

exports.generateCheckout = async (req, res, next) => {
  try {
    const isMember = !!(req.session?.user && req.session.user.is_member);
    const userId = req.session?.user
      ? (req.session.user.user_id || req.session.user.userId || req.session.user.id)
      : null;
    let cart = [];

    if (userId) {
      const rows = await new Promise((resolve, reject) => {
        cartitems.getByUserId(userId, (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });
      cart = (rows || []).map((r) => ({
        price: Number(r.price || 0),
        qty: Number(r.quantity || 0),
      }));
    } else {
      cart = ensureCart(req);
    }

    if (!cart || !cart.length) {
      req.session.checkoutAmount = 0;
      return res.redirect('/cart');
    }

    const totals = computeCartTotals(cart, isMember);
    const amount = Number(totals.total || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      req.session.checkoutAmount = 0;
      return res.redirect('/cart');
    }

    req.session.checkoutAmount = amount;
    res.render('checkout', {
      amount: amount.toFixed(2),
      totals,
      isMember,
      cart,
      user: req.session?.user || null,
    });
  } catch (err) {
    next(err);
  }
};
