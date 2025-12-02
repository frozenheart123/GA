const Product = require('../models/product');
const User = require('../models/user');

function ensureCart(req){
  if (!req.session.cart) req.session.cart = [];
  return req.session.cart;
}

exports.ensureCart = ensureCart;

async function persistCartForUser(req) {
  if (!req.session.user) return;
  try {
    await User.setSavedCart(req.session.user.user_id, req.session.cart || []);
  } catch (err) {
    console.error('persistCartForUser error:', err);
  }
}

exports.show = (req, res) => {
  const cart = ensureCart(req);
  const isMember = !!(req.session.user && req.session.user.is_member);
  let subtotal = 0;
  for (const i of cart) subtotal += Number(i.price) * Number(i.qty);
  const cashback = isMember ? subtotal * 0.05 : 0;
  const total = subtotal - cashback;
  // expose both names for compatibility with any views
  res.render('cart', { cart, totals: { subtotal, discount: cashback, cashback, total }, isMember });
};

exports.add = async (req, res) => {
  try{
    const cart = ensureCart(req);
    const { product_id, qty, name, price } = req.body;
    let item = null;
    if (product_id) {
      const p = await Product.getById(product_id);
      if (!p) return res.redirect(req.get('referer') || '/menu');
      const found = cart.find(i => i.product_id === p.product_id);
      if (found) { found.qty += Number(qty || 1); }
      else {
        cart.push({ product_id: p.product_id, name: p.name, price: Number(p.price), qty: Number(qty || 1) });
      }
    } else if (name && price) {
      const found = cart.find(i => !i.product_id && i.name === name);
      if (found) { found.qty += Number(qty || 1); }
      else { cart.push({ name, price: Number(price), qty: Number(qty || 1) }); }
    }
    await persistCartForUser(req);
    return res.redirect(req.get('referer') || '/cart');
  } catch (e) {
    console.error('Cart add error:', e);
    return res.redirect('/cart');
  }
};

exports.update = async (req, res) => {
  const cart = ensureCart(req);
  const { product_id, name } = req.body;
  let { qty } = req.body;
  qty = Math.max(1, Number(qty || 1));
  for (const i of cart) {
    if ((product_id && String(i.product_id) === String(product_id)) || (name && !i.product_id && i.name === name)) {
      i.qty = qty;
      break;
    }
  }
  await persistCartForUser(req);
  return res.redirect('/cart');
};

exports.remove = async (req, res) => {
  const cart = ensureCart(req);
  const { product_id, name } = req.body;
  const idx = cart.findIndex(i => (product_id && String(i.product_id) === String(product_id)) || (name && !i.product_id && i.name === name));
  if (idx >= 0) cart.splice(idx, 1);
  await persistCartForUser(req);
  return res.redirect('/cart');
};

exports.clear = async (req, res) => {
  req.session.cart = [];
  await persistCartForUser(req);
  return res.redirect('/cart');
};
