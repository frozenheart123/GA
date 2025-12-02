const path = require('path');
const User = require('../models/user');
const mfa = require('../utils/mfa');
const MfaModel = require('../models/mfa');
const speakeasy = require('speakeasy');
const Reports = require('../models/adminReports');

exports.getAccount = async (req, res) => {
  try {
    const uid = req.session.user.user_id;
    const profile = await User.getById(uid);
    try {
      const hasAvatar = await User.hasColumn('avatar_url');
      if (hasAvatar) {
        const url = await User.getColumn(uid, 'avatar_url');
        profile.avatar_url = url || null;
      } else {
        profile.avatar_url = req.session.user.avatar_url || null;
      }
    } catch (_) { profile.avatar_url = req.session.user.avatar_url || null; }
    const auth = await User.getAuthByIdFull(uid);
    const remaining = await MfaModel.getRemainingCount(uid).catch(() => 0);
    // If MFA is disabled, prepare a new secret for enrollment
    let mfaSetup = null;
    if (!auth || !auth.mfa_totp_enabled) {
      const secret = mfa.generateBase32Secret();
      const issuer = 'GA_Malamart';
      const accountName = profile ? profile.name : String(uid);
      const otpauth = mfa.buildOtpAuthUri({ issuer, accountName, secretBase32: secret });
      req.session.mfa_setup_secret = secret;
      mfaSetup = { secret, otpauth };
    }
    const headerPath = req.session.user.header_image || null;
    const backupPreview = req.session.mfa_backup_codes_preview || null;
    if (backupPreview) delete req.session.mfa_backup_codes_preview;
    let adminProfit = null;
    if (req.session.user && req.session.user.role === 'admin') {
      const today = new Date();
      const toDate = new Date(today);
      const fromDate = new Date(today);
      fromDate.setDate(today.getDate() - 29);
      const range = {
        from: `${fromDate.toISOString().slice(0, 10)} 00:00:00`,
        to: `${toDate.toISOString().slice(0, 10)} 23:59:59`,
      };
      const summary = await Reports.summary(range);
      const formatter = new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' });
      adminProfit = {
        summary,
        formattedGross: formatter.format(summary.gross || 0),
        formattedAvg: formatter.format(summary.avg || 0),
        rangeLabel: `${range.from.split(' ')[0]} - ${range.to.split(' ')[0]}`,
      };
    }
    res.render('account', { profile, headerPath, saved: !!req.query.saved, changed: !!req.query.changed, error: null, mfa: auth || { mfa_totp_enabled: 0 }, mfaSetup, backupRemaining: remaining, backupPreview, adminProfit });
  } catch (e) {
    console.error('getAccount error:', e);
    res.status(500).send('Internal Server Error');
  }
};

exports.postAccount = async (req, res) => {
  try {
    const uid = req.session.user.user_id;
    const { name, address, contact_number, email, new_password, confirm_password, totp_code } = req.body;
    const auth = await User.getAuthByIdFull(uid);

    // Update basic profile fields (no TOTP required)
    await User.updateProfile({ user_id: uid, name, address, contact_number, email });

    // Keep session name in sync
    req.session.user.name = name;

    // Optional password change (TOTP required when MFA enabled)
    if ((new_password && new_password.length) || (confirm_password && confirm_password.length)) {
      if (auth && auth.mfa_totp_enabled) {
        const secret = (auth.mfa_totp_iv && auth.mfa_totp_tag)
          ? mfa.decryptSecretParts(auth.mfa_totp_secret_enc, auth.mfa_totp_iv, auth.mfa_totp_tag)
          : mfa.decryptSecret(auth.mfa_totp_secret_enc);
        let okMfa = false;
        if (totp_code) {
          const token = String(totp_code).trim();
          okMfa = speakeasy.totp.verify({ secret, encoding: 'base32', token, window: 1 });
          if (!okMfa) okMfa = await MfaModel.consumeIfValid(uid, token);
        }
        if (!okMfa) {
          const profile = await User.getById(uid);
          const headerPath = req.session.user.header_image || null;
          const remaining = await MfaModel.getRemainingCount(uid).catch(() => 0);
          return res.status(403).render('account', { profile, headerPath, saved: true, changed: false, error: 'Authenticator or backup code required to change password', mfa: auth, mfaSetup: null, backupRemaining: remaining, backupPreview: null });
        }
      }
      if (new_password !== confirm_password) {
        const profile = await User.getById(uid);
        const headerPath = req.session.user.header_image || null;
        const remaining = await MfaModel.getRemainingCount(uid).catch(() => 0);
        return res.render('account', { profile, headerPath, saved: true, changed: false, error: 'Passwords do not match.', mfa: auth, mfaSetup: null, backupRemaining: remaining, backupPreview: null });
      }
      if (String(new_password).length < 6) {
        const profile = await User.getById(uid);
        const headerPath = req.session.user.header_image || null;
        const remaining = await MfaModel.getRemainingCount(uid).catch(() => 0);
        return res.render('account', { profile, headerPath, saved: true, changed: false, error: 'Password must be at least 6 characters.', mfa: auth, mfaSetup: null, backupRemaining: remaining, backupPreview: null });
      }
      await User.updatePassword(uid, new_password);
      return res.redirect('/account?changed=1&saved=1');
    }

    return res.redirect('/account?saved=1');
  } catch (e) {
    console.error('postAccount error:', e);
    res.status(500).send('Internal Server Error');
  }
};

exports.postHeader = async (req, res) => {
  try {
    if (!req.file) return res.redirect('/account');
    const rel = '/images/' + path.basename(req.file.path);
    req.session.user.header_image = rel;
    try {
      const has = await User.hasColumn('header_image');
      if (has) await User.updateColumn(req.session.user.user_id, 'header_image', rel);
    } catch (e) { /* ignore if column missing */ }
    return res.redirect('/account?saved=1');
  } catch (e) {
    console.error('postHeader error:', e);
    return res.redirect('/account');
  }
};

exports.postPayment = async (req, res) => {
  try {
    const { payment_type } = req.body;
    req.session.user.payment_type = payment_type || null;
    try {
      const has = await User.hasColumn('payment_type');
      if (has) await User.updateColumn(req.session.user.user_id, 'payment_type', payment_type || null);
    } catch (e) { /* ignore if column missing */ }
    return res.redirect('/account?saved=1');
  } catch (e) {
    console.error('postPayment error:', e);
    return res.redirect('/account');
  }
};

// Avatar upload (rounded user picture for navbar)
exports.postAvatar = async (req, res) => {
  try {
    if (!req.file) return res.redirect('/account');
    const rel = '/images/' + path.basename(req.file.path);
    // Ensure session store detects the change
    req.session.user = Object.assign({}, req.session.user, { avatar_url: rel });
    try {
      const has = await User.hasColumn('avatar_url');
      if (has) await User.updateColumn(req.session.user.user_id, 'avatar_url', rel);
    } catch (e) { /* ignore if column missing */ }
    return res.redirect(req.get('referer') || '/account');
  } catch (e) {
    console.error('postAvatar error:', e);
    return res.redirect('/account');
  }
};
// Enable MFA: verify code against session secret, then store encrypted
exports.postMfaEnable = async (req, res) => {
  try {
    const uid = req.session.user.user_id;
    const { totp_code } = req.body;
    const pendingSecret = req.session.mfa_setup_secret;
    if (!pendingSecret) return res.redirect('/account');
    const ok = speakeasy.totp.verify({ secret: pendingSecret, encoding: 'base32', token: String(totp_code || '').trim(), window: 2 });
    if (!ok) {
      const profile = await User.getById(uid);
      const headerPath = req.session.user.header_image || null;
      return res.status(400).render('account', { profile, headerPath, saved: false, changed: false, error: 'Invalid authenticator code.', mfa: { mfa_totp_enabled: 0 }, mfaSetup: { secret: pendingSecret, otpauth: mfa.buildOtpAuthUri({ issuer: 'GA_Malamart', accountName: profile.name, secretBase32: pendingSecret }) } });
    }
    const hasIv = await User.hasColumn('mfa_totp_iv').catch(() => false);
    const hasTag = await User.hasColumn('mfa_totp_tag').catch(() => false);
    if (hasIv && hasTag) {
      const parts = mfa.encryptSecretParts(pendingSecret);
      await User.enableMfaParts(uid, parts.ciphertext, parts.iv, parts.tag);
    } else {
      const enc = mfa.encryptSecret(pendingSecret);
      await User.enableMfa(uid, enc);
    }
    delete req.session.mfa_setup_secret;
    return res.redirect('/account?saved=1');
  } catch (e) {
    console.error('postMfaEnable error:', e);
    return res.redirect('/account');
  }
};

// Disable MFA: require a valid code on the existing secret
exports.postMfaDisable = async (req, res) => {
  try {
    const uid = req.session.user.user_id;
    const { totp_code } = req.body;
    const auth = await User.getAuthByIdFull(uid);
    if (!auth || !auth.mfa_totp_enabled) return res.redirect('/account');
    const secret = (auth.mfa_totp_iv && auth.mfa_totp_tag)
      ? mfa.decryptSecretParts(auth.mfa_totp_secret_enc, auth.mfa_totp_iv, auth.mfa_totp_tag)
      : mfa.decryptSecret(auth.mfa_totp_secret_enc);
    let okMfa = false;
    if (totp_code) {
      const token = String(totp_code).trim();
      okMfa = speakeasy.totp.verify({ secret, encoding: 'base32', token, window: 1 });
      if (!okMfa) okMfa = await MfaModel.consumeIfValid(uid, token);
    }
    if (!okMfa) {
      const profile = await User.getById(uid);
      const headerPath = req.session.user.header_image || null;
      const remaining = await MfaModel.getRemainingCount(uid).catch(() => 0);
      return res.status(400).render('account', { profile, headerPath, saved: false, changed: false, error: 'Invalid authenticator or backup code.', mfa: auth, mfaSetup: null, backupRemaining: remaining, backupPreview: null });
    }
    await User.disableMfa(uid);
    return res.redirect('/account?saved=1');
  } catch (e) {
    console.error('postMfaDisable error:', e);
    return res.redirect('/account');
  }
};

// Generate new backup codes (invalidate old ones)
exports.postMfaBackupGenerate = async (req, res) => {
  try {
    const uid = req.session.user.user_id;
    const auth = await User.getAuthById(uid);
    if (!auth || !auth.mfa_totp_enabled) return res.redirect('/account');
    const codes = MfaModel.generatePlainCodes(10, 10);
    await MfaModel.setCodes(uid, codes);
    req.session.mfa_backup_codes_preview = codes;
    return res.redirect('/account?saved=1');
  } catch (e) {
    console.error('postMfaBackupGenerate error:', e);
    return res.redirect('/account');
  }
};
