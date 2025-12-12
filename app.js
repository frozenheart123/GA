const path = require('path');
const express = require('express');
const multer = require('multer');
const session = require('express-session');
require('dotenv').config();

// Controllers
const homeController = require('./Controller/homeController');
const productsController = require('./Controller/productsController');
const membershipController = require('./Controller/membershipController');
const authController = require('./Controller/authController');
const adminController = require('./Controller/adminController');
const adminProductsController = require('./Controller/adminProductsController');
const adminUsersController = require('./Controller/adminUsersController');
const adminReportsController = require('./Controller/adminReportsController');
const adminOrdersController = require('./Controller/adminOrdersController');
const cartController = require('./Controller/cartController');
const paymentController = require('./Controller/paymentController');
const ordersController = require('./Controller/ordersController');
const accountController = require('./Controller/accountController');
const UserModel = require('./models/user');
const cartitems = require('./models/cartitems');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const mfaUtil = require('./utils/mfa');
const paynowUtils = require('./utils/paynow');
const db = require('./db');

const app = express();

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static assets
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session setup
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev_secret_change_me',
    resave: false,
    saveUninitialized: false,
  })
);

// Expose session user to views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

function requireAdmin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  if (req.session.user.role !== 'admin') return res.status(403).send('Forbidden');
  // Enforce MFA for admins by default
  const REQUIRE_MFA_FOR_ADMINS = (process.env.REQUIRE_MFA_FOR_ADMINS || '1') === '1';
  if (!REQUIRE_MFA_FOR_ADMINS) return next();
  UserModel.getAuthById(req.session.user.user_id)
    .then((auth) => {
      if (!auth || !auth.mfa_totp_enabled) return res.redirect('/account?enable_mfa=1');
      return next();
    })
    .catch(() => next());
}

function requireAuth(req, res, next){
  if (!req.session.user) return res.redirect('/login');
  // Optionally enforce MFA for all users
  const REQUIRE_MFA_FOR_ALL = (process.env.REQUIRE_MFA_FOR_ALL || '0') === '1';
  if (!REQUIRE_MFA_FOR_ALL) return next();
  UserModel.getAuthById(req.session.user.user_id)
    .then((auth) => {
      if (!auth || !auth.mfa_totp_enabled) return res.redirect('/account?enable_mfa=1');
      return next();
    })
    .catch(() => next());
}

const ADMIN_ALLOWED_PATHS = new Set(['/', '/menu', '/logout', '/2fa/setup', '/2fa/verify', '/account']);
const ADMIN_ALLOWED_PREFIXES = ['/admin', '/admin/products', '/admin/users', '/admin/orders', '/admin/reports', '/account'];

function isAdminRouteAllowed(path) {
  if (ADMIN_ALLOWED_PATHS.has(path)) return true;
  return ADMIN_ALLOWED_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix + '/'));
}

app.use((req, res, next) => {
  const user = req.session.user;
  if (user && user.role === 'admin' && !isAdminRouteAllowed(req.path)) {
    return res.redirect('/admin');
  }
  return next();
});

const IMAGE_DIR = path.join(__dirname, "public", "images");
const PRODUCT_ROUTE_PREFIX = "/admin/products";

const slugifyForFilename = (value) => {
  if (!value) return "";
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
};

const isProductImageUpload = (req) => {
  if (!req || !req.originalUrl) return false;
  return req.originalUrl.startsWith(PRODUCT_ROUTE_PREFIX);
};

const buildProductImageFilename = (req, file) => {
  const extRaw = path.extname(file.originalname || "") || ".jpg";
  const ext = extRaw.toLowerCase();
  const fallback = path.parse(file.originalname || "").name || "image";
  const baseValue = req.body && req.body.name ? req.body.name : fallback;
  const slug = slugifyForFilename(baseValue);
  return (slug || "image") + ext;
};

const buildFallbackFilename = (file) => {
  const safe = file.originalname ? file.originalname.replace(/[^a-zA-Z0-9_.-]/g, "_") : "image";
  return Date.now() + "-" + safe;
};

// Routes
app.get('/', homeController.getHome);
app.get('/menu', productsController.getMenu);
app.get('/membership', membershipController.getMembership);
app.post('/membership/join', membershipController.joinMembership);
// Auth
app.get('/register', authController.getRegister);
app.post('/register', authController.postRegister);
app.get('/login', authController.getLogin);
app.post('/login', authController.postLogin);
app.get('/logout', authController.logout);

// Cart
app.get('/cart', cartController.list);
app.post('/cart/add', cartController.addToCart);
app.post('/cart/decrease/:id', cartController.decreaseByOne);
app.post('/cart/delete/:id', cartController.removeFromCart);
app.post('/cart/remove', cartController.removeFromCart);
app.post('/cart/clear', cartController.clearCart);
const { ensureCart, computeCartTotals } = cartController;


app.get('/checkout', paymentController.generatePayNowCheckout);

app.post('/checkout', (req, res) => {
  const isMember = !!(req.session.user && req.session.user.is_member);
  // If logged in, compute totals from DB-backed cart; otherwise use session cart
  if (req.session && req.session.user) {
    const userId = (req.session.user.user_id || req.session.user.userId || req.session.user.id);
    return cartitems.getByUserId(userId, (err, rows) => {
      if (err) {
        console.error('GET /checkout cartitems.getByUserId error:', err);
        return res.redirect('/cart');
      }
      if (!rows || !rows.length) return res.redirect('/cart');
      const totals = computeCartTotals(rows, isMember);
      const paymentInfo = {
        name: req.body.name || (req.session.user && req.session.user.name) || 'Guest',
        email: req.body.email || (req.session.user && req.session.user.email) || '',
      };
      // Clear both session and DB cart after checkout
      req.session.cart = [];
      cartitems.clear(userId, (clearErr) => {
        if (clearErr) console.error('cartitems.clear error on checkout:', clearErr);
        return res.render('checkout_success', { totals, isMember, paymentInfo });
      });
    });
  }
  const cart = ensureCart(req);
  if (!cart.length) return res.redirect('/cart');
  const totals = computeCartTotals(cart, isMember);
  const paymentInfo = {
    name: req.body.name || 'Guest',
    email: req.body.email || '',
  };
  req.session.cart = [];
  return res.render('checkout_success', { totals, isMember, paymentInfo });
});

app.post('/checkout/confirm', (req, res) => {
  const isMember = !!(req.session.user && req.session.user.is_member);
  if (req.session && req.session.user) {
    const userId = (req.session.user.user_id || req.session.user.userId || req.session.user.id);
    return cartitems.getByUserId(userId, (err, rows) => {
      if (err) {
        console.error('POST /checkout/confirm cartitems.getByUserId error:', err);
        return res.redirect('/checkout');
      }
      if (!rows || !rows.length) return res.redirect('/checkout');
      const totals = computeCartTotals(rows, isMember);
      const amount = Number(req.body.amount || 0);
      if (Math.abs(amount - totals.total) > 0.01) {
        return res.status(400).send('Amount mismatch—please refresh and try again.');
      }
      const paymentInfo = {
        name: req.session.user ? req.session.user.name : 'Guest',
        email: req.session.user ? req.session.user.email : '',
        method: 'PayNow',
        reference: req.body.reference || 'PayNow',
      };
      req.session.cart = [];
      return res.render('checkout_success', { totals, isMember, paymentInfo });
    });
  }
  const cart = ensureCart(req);
  if (!cart.length) return res.redirect('/checkout');
  const totals = computeCartTotals(cart, isMember);
  const amount = Number(req.body.amount || 0);
  if (Math.abs(amount - totals.total) > 0.01) {
    return res.status(400).send('Amount mismatch—please refresh and try again.');
  }
  const paymentInfo = {
    name: 'Guest',
    email: '',
    method: 'PayNow',
    reference: req.body.reference || 'PayNow',
  };
  req.session.cart = [];
  return res.render('checkout_success', { totals, isMember, paymentInfo });
});
// Admin
app.get('/admin', requireAdmin, adminController.getDashboard);
// Multer storage for image uploads under public/images
const imgStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, IMAGE_DIR),
  filename: (req, file, cb) => {
    if (isProductImageUpload(req)) {
      cb(null, buildProductImageFilename(req, file));
    } else {
      cb(null, buildFallbackFilename(file));
    }
  },
});
const upload = multer({ storage: imgStorage });

app.get('/admin/products', requireAdmin, adminProductsController.dashboard);
app.get('/admin/products/add', requireAdmin, adminProductsController.getAdd);
app.post('/admin/products/add', requireAdmin, upload.single('image_file'), adminProductsController.postAdd);
app.get('/admin/products/:id/edit', requireAdmin, adminProductsController.getEdit);
app.post('/admin/products/:id/edit', requireAdmin, upload.single('image_file'), adminProductsController.postEdit);
app.post('/admin/products/:id/toggle', requireAdmin, adminProductsController.postToggle);
app.post('/admin/products/:id/delete', requireAdmin, adminProductsController.postDelete);
app.get('/admin/users', requireAdmin, adminUsersController.dashboard);
app.get('/admin/users/add', requireAdmin, adminUsersController.getAdd);
app.post('/admin/users/add', requireAdmin, adminUsersController.postAdd);
app.get('/admin/users/:id/edit', requireAdmin, adminUsersController.getEdit);
app.post('/admin/users/:id/edit', requireAdmin, adminUsersController.postEdit);
app.post('/admin/users/:id/resetpw', requireAdmin, adminUsersController.postResetPw);
app.post('/admin/users/:id/member', requireAdmin, adminUsersController.postMakeMember);
app.post('/admin/users/:id/member/clear', requireAdmin, adminUsersController.postClearMember);
app.get('/admin/orders', requireAdmin, adminOrdersController.dashboard);
app.post('/admin/orders/:id/status', requireAdmin, adminOrdersController.postStatus);
app.get('/admin/reports', requireAdmin, adminReportsController.dashboard);

// Orders
app.get('/orders', requireAuth, ordersController.getMyOrders);
// Account
app.get('/account', requireAuth, accountController.getAccount);
app.post('/account', requireAuth, accountController.postAccount);
app.post('/account/header', requireAuth, upload.single('header_image'), accountController.postHeader);
app.post('/account/payment', requireAuth, accountController.postPayment);
app.post('/account/avatar', requireAuth, upload.single('avatar'), accountController.postAvatar);
// MFA management
app.post('/account/mfa/enable', requireAuth, accountController.postMfaEnable);
app.post('/account/mfa/disable', requireAuth, accountController.postMfaDisable);
app.post('/account/mfa/backup/generate', requireAuth, accountController.postMfaBackupGenerate);

// 2FA setup (two-step) using speakeasy + qrcode
app.get('/2fa/setup', requireAuth, async (req, res) => {
  try {
    const auth = await UserModel.getAuthById(req.session.user.user_id);
    if (auth && auth.mfa_totp_enabled) return res.redirect('/account');
    const name = req.session.user.name || `user${req.session.user.user_id}`;
    const secret = speakeasy.generateSecret({ length: 20, name: `GA_Malamart:${name}`, issuer: 'GA_Malamart' });
    req.session.pending2FA = { base32: secret.base32, otpauth_url: secret.otpauth_url };
    const qr = await QRCode.toDataURL(secret.otpauth_url);
    res.render('2fa_setup', { qrDataUrl: qr, secretBase32: secret.base32, error: null, actionPath: '/2fa/setup' });
  } catch (e) {
    console.error('GET /2fa/setup error:', e);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/2fa/setup', requireAuth, async (req, res) => {
  try {
    const pending = req.session.pending2FA;
    if (!pending) return res.redirect('/2fa/setup');
    const token = String(req.body.token || '').trim();
    const ok = speakeasy.totp.verify({ secret: pending.base32, encoding: 'base32', token, window: 2 });
    if (!ok) {
      const qr = await QRCode.toDataURL(pending.otpauth_url);
      return res.render('2fa_setup', { qrDataUrl: qr, secretBase32: pending.base32, error: 'Invalid code. Try again.', actionPath: '/2fa/setup' });
    }
    const hasIv = await UserModel.hasColumn('mfa_totp_iv').catch(() => false);
    const hasTag = await UserModel.hasColumn('mfa_totp_tag').catch(() => false);
    if (hasIv && hasTag) {
      const parts = mfaUtil.encryptSecretParts(pending.base32);
      await UserModel.enableMfaParts(req.session.user.user_id, parts.ciphertext, parts.iv, parts.tag);
    } else {
      const enc = mfaUtil.encryptSecret(pending.base32);
      await UserModel.enableMfa(req.session.user.user_id, enc);
    }
    delete req.session.pending2FA;
    res.redirect('/account');
  } catch (e) {
    console.error('POST /2fa/setup error:', e);
    res.status(500).send('Internal Server Error');
  }
});

// 2FA verify (two-step)
const buildVerifyPayload = async (req) => {
  const uid = req.session.preAuthUserId;
  if (!uid) return { showQRCode: false };
  try {
    const auth = await UserModel.getAuthByIdFull(uid);
    const user = await UserModel.getById(uid);
    if (auth && auth.mfa_totp_enabled && auth.mfa_totp_secret_enc) {
      const base32 = (auth.mfa_totp_iv && auth.mfa_totp_tag)
        ? mfaUtil.decryptSecretParts(auth.mfa_totp_secret_enc, auth.mfa_totp_iv, auth.mfa_totp_tag)
        : mfaUtil.decryptSecret(auth.mfa_totp_secret_enc);
      if (base32) {
        const accountName = user && user.name ? user.name : `user${uid}`;
        const otpauth = `otpauth://totp/${encodeURIComponent('GA_Malamart:'+accountName)}?secret=${encodeURIComponent(base32)}&issuer=GA_Malamart&digits=6&period=30&algorithm=SHA1`;
        const qrDataUrl = await QRCode.toDataURL(otpauth);
        return { showQRCode: true, qrDataUrl, otpauthUri: otpauth };
      }
    }
    const pending = req.session.pending2FA || {};
    if (!pending.base32 || !pending.otpauth_url) {
      const name = user && user.name ? user.name : `user${uid}`;
      const secret = speakeasy.generateSecret({ length: 20, issuer: 'GA_Malamart', name: `GA_Malamart:${name}` });
      req.session.pending2FA = { base32: secret.base32, otpauth_url: secret.otpauth_url };
    }
    const qrDataUrl = await QRCode.toDataURL(req.session.pending2FA.otpauth_url);
    return { showQRCode: true, qrDataUrl, otpauthUri: req.session.pending2FA.otpauth_url };
  } catch (e) {
    console.error('buildVerifyPayload error:', e);
    return { showQRCode: false, otpauthUri: null };
  }
};

app.get('/2fa/verify', async (req, res) => {
  try {
    const uid = req.session.preAuthUserId;
    if (!uid) return res.redirect('/login');
    const payload = await buildVerifyPayload(req);
    res.render('2fa_verify', { error: null, otpauthUri: payload.otpauthUri || null, ...payload });
  } catch (e) {
    console.error('GET /2fa/verify error:', e);
    res.redirect('/login');
  }
});

app.post('/2fa/verify', async (req, res) => {
  let uid = null;
  try {
    uid = req.session.preAuthUserId;
    if (!uid) return res.redirect('/login');
    const pending = req.session.pending2FA;
    const auth = await UserModel.getAuthByIdFull(uid);
    const token = String(req.body.token || '').trim();
    let secretBase32 = null;
    if (pending && pending.base32) {
      secretBase32 = pending.base32;
    } else if (auth && auth.mfa_totp_enabled) {
      secretBase32 = (auth.mfa_totp_iv && auth.mfa_totp_tag)
        ? mfaUtil.decryptSecretParts(auth.mfa_totp_secret_enc, auth.mfa_totp_iv, auth.mfa_totp_tag)
        : mfaUtil.decryptSecret(auth.mfa_totp_secret_enc);
    }
    if (!secretBase32) {
      const payload = await buildVerifyPayload(req);
      return res.render('2fa_verify', { error: '2FA not configured.', otpauthUri: payload.otpauthUri || null, ...payload });
    }
    const ok = speakeasy.totp.verify({ secret: secretBase32, encoding: 'base32', token, window: 2 });
    if (!ok) {
      const payload = await buildVerifyPayload(req);
      return res.render('2fa_verify', { error: 'Invalid code.', otpauthUri: payload.otpauthUri || null, ...payload });
    }
    if (pending && pending.base32) {
      const hasIv = await UserModel.hasColumn('mfa_totp_iv').catch(() => false);
      const hasTag = await UserModel.hasColumn('mfa_totp_tag').catch(() => false);
      if (hasIv && hasTag) {
        const parts = mfaUtil.encryptSecretParts(pending.base32);
        await UserModel.enableMfaParts(uid, parts.ciphertext, parts.iv, parts.tag);
      } else {
        const enc = mfaUtil.encryptSecret(pending.base32);
        await UserModel.enableMfa(uid, enc);
      }
      delete req.session.pending2FA;
    }
    const user = await UserModel.getById(uid);
    const savedCart = await UserModel.getSavedCart(uid).catch(() => null);
    req.session.user = { user_id: uid, name: user.name, role: user.role, is_member: user.is_member, avatar_url: user.avatar_url || null };
    req.session.cart = Array.isArray(savedCart) ? savedCart : [];
    req.session.passed2FA = true;
    delete req.session.preAuthUserId;
    if (user.role === 'admin') return res.redirect('/admin');
    return res.redirect('/');
  } catch (e) {
    console.error('POST /2fa/verify error:', e);
    const payload = uid ? await buildVerifyPayload(req) : { showQRCode: false, otpauthUri: null };
    res.render('2fa_verify', { error: 'Internal Server Error', otpauthUri: payload.otpauthUri || null, ...payload });
  }
});

// Health check (optional)
app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

