const crypto = require('crypto');

// Minimal Base32 (RFC 4648) decode for TOTP secrets
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(base32) {
  const clean = String(base32 || '').replace(/=+$/,'').toUpperCase().replace(/\s+/g,'');
  let bits = '';
  for (const c of clean) {
    const val = ALPHABET.indexOf(c);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    out.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(out);
}

function generateBase32Secret(bytes = 20) {
  const buf = crypto.randomBytes(bytes);
  // Encode to Base32
  let bits = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5);
    if (chunk.length < 5) {
      out += ALPHABET[parseInt(chunk.padEnd(5, '0'), 2)];
    } else {
      out += ALPHABET[parseInt(chunk, 2)];
    }
  }
  const padLen = (8 - (out.length % 8)) % 8;
  return out + '='.repeat(padLen);
}

function hotp(secretBase32, counter, digits = 6, algo = 'sha1') {
  const key = base32Decode(secretBase32);
  const msg = Buffer.alloc(8);
  let tmp = BigInt(counter);
  for (let i = 7; i >= 0; i--) {
    msg[i] = Number(tmp & 0xffn);
    tmp >>= 8n;
  }
  const hmac = crypto.createHmac(algo, key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | (hmac[offset + 3]);
  const str = String(code % 10 ** digits).padStart(digits, '0');
  return str;
}

function totp(secretBase32, { period = 30, digits = 6, epoch = Date.now(), algo = 'sha1' } = {}) {
  const counter = Math.floor(epoch / 1000 / period);
  return hotp(secretBase32, counter, digits, algo);
}

function verifyTotp(secretBase32, token, { window = 1, period = 30, digits = 6, algo = 'sha1' } = {}) {
  if (!secretBase32 || !token) return false;
  const now = Date.now();
  token = String(token).trim();
  if (token.length !== digits) return false;
  for (let w = -window; w <= window; w++) {
    const t = now + w * period * 1000;
    const expected = totp(secretBase32, { period, digits, epoch: t, algo });
    try {
      if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token))) return true;
    } catch (_) {
      // length mismatch or other error -> treat as not equal
    }
  }
  return false;
}

// Encrypt/decrypt using AES-256-GCM; store as base64(iv|ciphertext|tag)
function getKey() {
  const raw = process.env.MFA_KEY || '';
  const buf = Buffer.from(raw, 'utf8');
  if (buf.length >= 32) return buf.slice(0, 32);
  // Derive a 32-byte key from provided string
  return require('crypto').createHash('sha256').update(raw || 'dev_mfa_key_change_me').digest();
}

function encryptSecret(secretBase32) {
  const iv = crypto.randomBytes(12);
  const key = getKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(secretBase32, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.from(Buffer.concat([iv, ct, tag])).toString('base64');
}

function decryptSecret(payloadBase64) {
  if (!payloadBase64) return null;
  const b64 = Buffer.isBuffer(payloadBase64) ? payloadBase64.toString('utf8') : String(payloadBase64);
  const buf = Buffer.from(b64, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(buf.length - 16);
  const ct = buf.subarray(12, buf.length - 16);
  const key = getKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

function buildOtpAuthUri({ issuer, accountName, secretBase32, digits = 6, period = 30, algorithm = 'SHA1' }) {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({ secret: secretBase32.replace(/=+$/,''), issuer, digits: String(digits), period: String(period), algorithm });
  return `otpauth://totp/${label}?${params.toString()}`;
}

function hasNonEmpty(value) {
  if (value == null) return false;
  if (Buffer.isBuffer(value)) return value.length > 0;
  if (ArrayBuffer.isView(value)) return value.byteLength > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

module.exports = {
  generateBase32Secret,
  verifyTotp,
  encryptSecret,
  decryptSecret,
  buildOtpAuthUri,
  hasNonEmpty,
};

// Extended helpers when storing IV and tag in separate DB columns
function encryptSecretParts(secretBase32) {
  const iv = crypto.randomBytes(12);
  const key = getKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(secretBase32, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: ct, iv, tag };
}

function decryptSecretParts(ciphertext, iv, tag) {
  if (!ciphertext || !iv || !tag) return null;
  try {
    const key = getKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv));
    decipher.setAuthTag(Buffer.from(tag));
    const pt = Buffer.concat([decipher.update(Buffer.from(ciphertext)), decipher.final()]);
    return pt.toString('utf8');
  } catch (e) {
    return null;
  }
}

module.exports.encryptSecretParts = encryptSecretParts;
module.exports.decryptSecretParts = decryptSecretParts;
