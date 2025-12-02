const CRC16_POLY = 0x1021;

function formatTLV(id, value) {
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

function crc16(payload) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ CRC16_POLY) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc;
}

function buildPayNowPayload({ amount, proxyType = '0', proxyValue, merchantName, merchantCity, reference }) {
  if (!proxyValue) throw new Error('proxyValue required');
  const sanitizedProxy = proxyValue.replace(/\D/g, '');
  if (!sanitizedProxy) throw new Error('invalid proxy value');
  const safeAmount = Number(amount);
  const formattedAmount = Number.isFinite(safeAmount) && safeAmount > 0 ? safeAmount.toFixed(2) : '0.01';
  const sanitizedMerchant = (merchantName || 'Mala Hot Pot').substring(0, 25);
  const sanitizedCity = (merchantCity || 'SINGAPORE').substring(0, 15);
  const paynowReference = (reference || `PN${Date.now()}`).substring(0, 25);

  let payload = '';
  payload += formatTLV('00', '01'); // Payload Format Indicator
  payload += formatTLV('01', '11'); // Point of Initiation: 11 = static

  let paynowData = '';
  paynowData += formatTLV('00', 'SG.PAYNOW');
  paynowData += formatTLV('01', proxyType);
  paynowData += formatTLV('02', sanitizedProxy);
  paynowData += formatTLV('08', '0'); // amount editable flag
  payload += formatTLV('26', paynowData);

  payload += formatTLV('52', '0000');
  payload += formatTLV('53', '702');
  payload += formatTLV('54', formattedAmount);
  payload += formatTLV('58', 'SG');
  payload += formatTLV('59', sanitizedMerchant);
  payload += formatTLV('60', sanitizedCity);
  const refTLV = formatTLV('01', paynowReference);
  payload += formatTLV('62', refTLV);

  const payloadWithCrc = `${payload}6304`;
  const crcValue = crc16(payloadWithCrc);
  const crcHex = crcValue.toString(16).toUpperCase().padStart(4, '0');
  return `${payloadWithCrc}${crcHex}`;
}

function parseTLV(payload) {
  const entries = [];
  let cursor = 0;
  while (cursor < payload.length) {
    const id = payload.substr(cursor, 2);
    const len = parseInt(payload.substr(cursor + 2, 2), 10);
    const value = payload.substr(cursor + 4, len);
    entries.push({ id, len, value });
    cursor += 4 + len;
    if (id === '63') break;
  }
  return entries;
}

function printTLV(payload, depth = 0) {
  const entries = parseTLV(payload);
  entries.forEach(entry => {
    console.log(`${'  '.repeat(depth)}${entry.id} (${entry.len}): ${entry.value}`);
    if (entry.id === '26' || entry.id === '62') {
      let subcursor = 0;
      while (subcursor < entry.value.length) {
        const subId = entry.value.substr(subcursor, 2);
        const subLen = parseInt(entry.value.substr(subcursor + 2, 2), 10);
        const subValue = entry.value.substr(subcursor + 4, subLen);
        printTLV(subId + subLen.toString().padStart(2, '0') + subValue, depth + 1);
        subcursor += 4 + subLen;
      }
    }
  });
}

module.exports = { buildPayNowPayload, printTLV };
