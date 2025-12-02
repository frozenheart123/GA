const User = require('../models/user');
const mfa = require('../utils/mfa');
const MfaModel = require('../models/mfa');
const speakeasy = require('speakeasy');

exports.getRegister = (req, res) => {
  res.render('register', { error: null });
};

exports.postRegister = async (req, res) => {
  try {
    const { name, email, address, contact_number, password, confirm_password } = req.body;
    if (!name || !email || !password) return res.status(400).render('register', { error: 'Name, email and password are required.' });
    const emailTrim = String(email).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) return res.status(400).render('register', { error: 'Please enter a valid email address.' });
    if (String(password).length < 6) return res.status(400).render('register', { error: 'Password must be at least 6 characters.' });
    if (password !== confirm_password) return res.status(400).render('register', { error: 'Passwords do not match.' });
    const existing = await User.findByName(name);
    if (existing) return res.status(400).render('register', { error: 'User already exists.' });
    const created = await User.createUser({ name, email: emailTrim, address, contact_number, password });
    // Bootstrap session
    req.session.user = { user_id: created.user_id, name: created.name, role: created.role, is_member: created.is_member, avatar_url: created.avatar_url || null };
    // Immediately start 2FA setup so the user confirms on their phone
    return res.redirect('/2fa/setup');
  } catch (err) {
    console.error('Register error:', err);
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(400).render('register', { error: 'Email or name already in use.' });
    }
    return res.status(500).render('register', { error: 'Internal Server Error' });
  }
};

exports.getLogin = (req, res) => {
  res.render('login', { error: null });
};

exports.postLogin = async (req, res) => {
  try {
    const { name, password } = req.body;
    if (!name || !password) return res.status(400).render('login', { error: 'Name and password are required.' });
    const user = await User.findByName(name);
    if (!user) return res.status(401).render('login', { error: 'Invalid credentials.' });
    // Reset membership if expired (FR1.5)
    await User.resetMembershipIfExpired(user.user_id);
    const ok = await User.verifyPassword(password, user.password_hash, user.user_id);
    if (!ok) return res.status(401).render('login', { error: 'Invalid credentials.' });
    // Two-step: if user has 2FA enabled, go to verify; otherwise force setup
    if (user.mfa_totp_enabled) {
      req.session.preAuthUserId = user.user_id;
      return res.redirect('/2fa/verify');
    }
    // Force all users to enroll MFA before completing login
    const savedCart = await User.getSavedCart(user.user_id).catch(() => null);
    req.session.user = { user_id: user.user_id, name: user.name, role: user.role, is_member: user.is_member, avatar_url: user.avatar_url || null };
    req.session.cart = Array.isArray(savedCart) ? savedCart : [];
    return res.redirect('/2fa/setup');
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).render('login', { error: 'Internal Server Error' });
  }
};

exports.logout = async (req, res) => {
  const userId = req.session && req.session.user ? req.session.user.user_id : null;
  const currentCart = req.session && req.session.cart ? req.session.cart : [];
  if (userId) {
    await User.setSavedCart(userId, currentCart).catch((err) => console.error('logout cart save error:', err));
  }
  const savedCartKey = userId ? `cart_saved_user_${userId}` : null;
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    const logoutHtml = `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <title>Signing out…</title>
          <script>
            (function(){
              try {
                const userCartKey = ${savedCartKey ? `'${savedCartKey}'` : 'null'};
                const storedCart = localStorage.getItem('cart');
                if (userCartKey && storedCart !== null) {
                  localStorage.setItem(userCartKey, storedCart);
                }
                localStorage.removeItem('cart');
                localStorage.removeItem('is_member');
                localStorage.removeItem('member_expires');
              } catch (err) {
                console.error('Logout cleanup error:', err);
              }
              window.location.replace('/');
            })();
          </script>
          <noscript>
            <meta http-equiv="refresh" content="0;url=/">
          </noscript>
        </head>
        <body>
          <p>Signing out…</p>
        </body>
      </html>`;
    res.send(logoutHtml);
  });
};
