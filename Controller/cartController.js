const Product = require('../models/product');
const User = require('../models/user');
const cartitems = require('../models/cartitems');

const CartController = {
    // List cart (DB-backed)
    list: function (req, res) {
      const user = req.session && req.session.user;
      if (!user) {
        req.flash && req.flash('error', 'Please log in to view your cart.');
        return res.redirect('/login');
      }

      const userId = (user.userId || user.id);
      cartitems.getByUserId(userId, (err, rows) => {
        if (err) {
          console.error('cartitems.getByUserId error:', err);
          req.flash && req.flash('error', 'Unable to load cart.');
          return res.redirect('/shopping');
        }

        if (!rows || !rows.length) return res.render('cart', { user, cart: [], totalQty: 0, totalPrice: 0 });

        const cart = [];
        let totalQty = 0;
        let totalPrice = 0;
        let remaining = rows.length;

        rows.forEach(row => {
          SupermarketModel.getProductById({ id: row.productId }, (err2, product) => {
            if (err2) console.error('getProductById error in cart list:', err2);
            if (Array.isArray(product)) product = product[0];
            const item = {
              productId: String(row.productId),
              productName: product ? (product.productName || product.name) : 'Unknown',
              price: Number(product ? (product.price || 0) : 0),
              image: product ? product.image : null,
              quantity: Number(row.quantity || 0)
            };
            cart.push(item);
            totalQty += item.quantity;
            totalPrice += item.price * item.quantity;
            remaining -= 1;
            if (remaining === 0) return res.render('cart', { user, cart, totalQty, totalPrice });
          });
        });
      });
    },
  // Add product to user's cart
  addToCart: function (req, res) {

    const user = req.session && req.session.user;
    if (!user) {
        req.flash && req.flash('error', 'Please log in to add items to cart.');
        return res.redirect('/login');
    }

    const productId = req.body.productId || req.params.id;
    const qty = Number(req.body.quantity || 1);
    if (!productId) {
        req.flash && req.flash('error', 'No product specified.');
        // safe redirect: use referrer header or fallback to shopping page
        return res.redirect(req.get('Referrer') || req.get('Referer') || '/shopping');
    }

    SupermarketModel.getProductById({ id: productId }, function (err, product) {
        if (err) {
            console.error('getProductById error:', err);
            req.flash && req.flash('error', 'Unable to add product. Try again.');
            return res.redirect(req.get('Referrer') || req.get('Referer') || '/shopping');
        }

        // handle model returning array or single object
        if (Array.isArray(product)) product = product[0];
        if (!product) {
            req.flash && req.flash('error', 'Product not found.');
            return res.redirect(req.get('Referrer') || req.get('Referer') || '/shopping');
        }

        const userId = (req.session.user && (req.session.user.userId || req.session.user.id));
        const unitPrice = product && (product.price || 0);
        // Prevent adding if product has no stock
        const available = Number(product.quantity || 0);
        if (available <= 0) {
          req.flash && req.flash('error', 'Product is out of stock.');
          return res.redirect(req.get('Referrer') || req.get('Referer') || '/shopping');
        }

        // check existing cart quantity for this user/product
        cartitems.getItem(userId, productId, (gErr, existing) => {
          if (gErr) {
            console.error('cartitems.getItem error:', gErr);
            req.flash && req.flash('error', 'Unable to add product to cart.');
            return res.redirect(req.get('Referrer') || req.get('Referer') || '/shopping');
          }
          const already = existing ? Number(existing.quantity || 0) : 0;
          const MAX_PER_USER = 10;
          const remainingCap = MAX_PER_USER - already;
          if (remainingCap <= 0) {
            req.flash && req.flash('error', `You already have the maximum of ${MAX_PER_USER} units of this product in your cart.`);
            return res.redirect(req.get('Referrer') || req.get('Referer') || '/shopping');
          }

          // compute allowed quantity based on stock and cap
          const spaceByStock = Math.max(0, available - already);
          let allowed = Math.min(qty, spaceByStock, remainingCap);
          if (allowed <= 0) {
            if (spaceByStock <= 0) {
              req.flash && req.flash('error', `Cannot add more of this product. Only ${available} available and ${already} already in your cart.`);
            } else {
              req.flash && req.flash('error', `You can add at most ${remainingCap} more unit(s) of this product (purchase limit ${MAX_PER_USER}).`);
            }
            return res.redirect(req.get('Referrer') || req.get('Referer') || '/shopping');
          }

          cartitems.add(userId, productId, allowed, unitPrice, function (errAdd) {
            if (errAdd) {
              console.error('cartitems.add error:', errAdd);
              // surface friendly message if cap reached
              const msg = (errAdd && errAdd.message && errAdd.message.indexOf('Maximum 10') !== -1) ? errAdd.message : 'Unable to add product to cart.';
              req.flash && req.flash('error', msg);
              return res.redirect(req.get('Referrer') || req.get('Referer') || '/shopping');
            }
            if (allowed < qty) {
              req.flash && req.flash('success', `Added ${allowed} unit(s) to cart (limited by stock or per-user cap).`);
            } else {
              req.flash && req.flash('success', 'Product added to cart.');
            }
            return res.redirect(req.get('Referrer') || req.get('Referer') || '/shopping');
          });
        });
    });
  },

  // Remove product from cart (decrease or remove)
  removeFromCart: function (req, res) {
    const user = req.session && req.session.user;
    if (!user) {
      req.flash && req.flash('error', 'Please log in.');
      return res.redirect('/login');
    }
    const productId = req.body.productId || req.params.id;
    if (!productId) return res.redirect('back');
    const userId = (req.session.user && (req.session.user.userId || req.session.user.id));
    cartitems.remove(userId, productId, (err) => {
      if (err) {
        console.error('cartitems.remove error:', err);
        req.flash && req.flash('error', 'Could not remove item');
        return res.redirect('/cart');
      }
      req.flash && req.flash('success', 'Item removed from cart.');
      return res.redirect('/cart');
    });
  },

  // Decrease quantity of an item by one. If quantity reaches 0, remove the item.
  decreaseByOne: function (req, res) {
    const user = req.session && req.session.user;
    if (!user) {
      req.flash && req.flash('error', 'Please log in.');
      return res.redirect('/login');
    }

    const productId = req.params.id || req.body.productId;
    if (!productId) {
      return res.redirect(req.get('Referrer') || req.get('Referer') || '/cart');
    }

    const userId = (req.session.user && (req.session.user.userId || req.session.user.id));
      cartitems.decrement(userId, productId, 1, (err) => {
      if (err) {
        console.error('cartitems.decrement error:', err);
        req.flash && req.flash('error', 'Could not update cart');
        return res.redirect('/cart');
      }
      req.flash && req.flash('success', 'Cart updated.');
      return res.redirect('/cart');
    });
  },

  // Clear the entire cart
  clearCart: function (req, res) {
    const user = req.session && req.session.user;
    if (!user) {
      req.flash && req.flash('error', 'Please log in.');
      return res.redirect('/login');
    }

    const userId = (req.session.user && (req.session.user.userId || req.session.user.id));
    cartitems.clear(userId, (err) => {
      if (err) {
        console.error('cartitems.clear error:', err);
        req.flash && req.flash('error', 'Could not clear cart');
        return res.redirect('/cart');
      }
      req.flash && req.flash('success', 'Cart cleared.');
      return res.redirect('/cart');
    });
  }
  
};
// Ensure a session-backed cart exists (used by session/local cart flows)
CartController.ensureCart = function (req) {
  if (!req || !req.session) return [];
  if (!Array.isArray(req.session.cart)) req.session.cart = [];
  return req.session.cart;
};

// Compute cart totals (works with items that use `qty` or `quantity`)
CartController.computeCartTotals = function (cart, isMember) {
  const subtotal = Array.isArray(cart)
    ? cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || item.quantity || 0), 0)
    : 0;
  const cashback = isMember ? subtotal * 0.05 : 0;
  const total = subtotal - cashback;
  return { subtotal, cashback, total };
};

module.exports = CartController;




// const Product = require('../models/product');
// const User = require('../models/user');

// function ensureCart(req){
//   if (!req.session.cart) req.session.cart = [];
//   return req.session.cart;
// }

// exports.ensureCart = ensureCart;

// async function persistCartForUser(req) {
//   if (!req.session.user) return;
//   try {
//     await User.setSavedCart(req.session.user.user_id, req.session.cart || []);
//   } catch (err) {
//     console.error('persistCartForUser error:', err);
//   }
// }

// exports.show = (req, res) => {
//   const cart = ensureCart(req);
//   const isMember = !!(req.session.user && req.session.user.is_member);
//   let subtotal = 0;
//   for (const i of cart) subtotal += Number(i.price) * Number(i.qty);
//   const cashback = isMember ? subtotal * 0.05 : 0;
//   const total = subtotal - cashback;
//   // expose both names for compatibility with any views
//   res.render('cart', { cart, totals: { subtotal, discount: cashback, cashback, total }, isMember });
// };

// exports.add = async (req, res) => {
//   try{
//     const cart = ensureCart(req);
//     const { product_id, qty, name, price } = req.body;
//     let item = null;
//     if (product_id) {
//       const p = await Product.getById(product_id);
//       if (!p) return res.redirect(req.get('referer') || '/menu');
//       const found = cart.find(i => i.product_id === p.product_id);
//       if (found) { found.qty += Number(qty || 1); }
//       else {
//         cart.push({ product_id: p.product_id, name: p.name, price: Number(p.price), qty: Number(qty || 1) });
//       }
//     } else if (name && price) {
//       const found = cart.find(i => !i.product_id && i.name === name);
//       if (found) { found.qty += Number(qty || 1); }
//       else { cart.push({ name, price: Number(price), qty: Number(qty || 1) }); }
//     }
//     await persistCartForUser(req);
//     return res.redirect(req.get('referer') || '/cart');
//   } catch (e) {
//     console.error('Cart add error:', e);
//     return res.redirect('/cart');
//   }
// };

// exports.update = async (req, res) => {
//   const cart = ensureCart(req);
//   const { product_id, name } = req.body;
//   let { qty } = req.body;
//   qty = Math.max(1, Number(qty || 1));
//   for (const i of cart) {
//     if ((product_id && String(i.product_id) === String(product_id)) || (name && !i.product_id && i.name === name)) {
//       i.qty = qty;
//       break;
//     }
//   }
//   await persistCartForUser(req);
//   return res.redirect('/cart');
// };

// exports.remove = async (req, res) => {
//   const cart = ensureCart(req);
//   const { product_id, name } = req.body;
//   const idx = cart.findIndex(i => (product_id && String(i.product_id) === String(product_id)) || (name && !i.product_id && i.name === name));
//   if (idx >= 0) cart.splice(idx, 1);
//   await persistCartForUser(req);
//   return res.redirect('/cart');
// };

// exports.clear = async (req, res) => {
//   req.session.cart = [];
//   await persistCartForUser(req);
//   return res.redirect('/cart');
// };
