const { Redis } = require('@upstash/redis');
const QRCode = require('qrcode');
const { parseCodaboxEmail, generateEpcPayload } = require('./_codabox');

function getRedis() {
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

function basicAuthOk(req) {
  const expectedUser = process.env.CLOUDMAILIN_WEBHOOK_USER;
  const expectedPass = process.env.CLOUDMAILIN_WEBHOOK_PASS;
  if (!expectedUser || !expectedPass) return false;

  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;

  const decoded = Buffer.from(header.slice(6), 'base64').toString();
  const idx = decoded.indexOf(':');
  if (idx < 0) return false;

  return decoded.slice(0, idx) === expectedUser && decoded.slice(idx + 1) === expectedPass;
}

function getMessageId(payload) {
  const h = payload.headers;
  if (!h) return null;
  if (typeof h === 'object') {
    return h['Message-ID'] || h['Message-Id'] || h['message-id'] || null;
  }
  if (typeof h === 'string') {
    const m = h.match(/^Message-ID:\s*<?([^>\s]+)>?/im);
    return m ? m[1] : null;
  }
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!basicAuthOk(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const allowedEmail = (process.env.MAILBOX_SCAN_ALLOWED_EMAIL || '').trim().toLowerCase();
  if (!allowedEmail) {
    return res.status(503).json({ error: 'MAILBOX_SCAN_ALLOWED_EMAIL niet geconfigureerd' });
  }

  const redis = getRedis();

  const userSub = await redis.get(`mailbox:emailToSub:${allowedEmail}`);
  if (!userSub) {
    return res.status(503).json({
      error: 'Gebruiker moet eerst inloggen op Genius Pay zodat de mapping wordt aangemaakt',
    });
  }

  const payload = req.body || {};
  const messageId = getMessageId(payload);

  if (messageId) {
    const seen = await redis.sismember(`mailbox:processed:${userSub}`, messageId);
    if (seen) {
      return res.json({ ok: true, skipped: 'already-processed' });
    }
  }

  const body = payload.html || payload.plain || payload.body || '';
  const parsed = parseCodaboxEmail(body);

  if (messageId) {
    await redis.sadd(`mailbox:processed:${userSub}`, messageId);
  }

  if (!parsed) {
    return res.json({ ok: true, skipped: 'parse-failed' });
  }
  if (parsed.paid) {
    return res.json({ ok: true, skipped: 'already-paid' });
  }

  const epcPayload = generateEpcPayload(parsed);
  const qrDataUrl = await QRCode.toDataURL(epcPayload, {
    width: 400,
    margin: 2,
    errorCorrectionLevel: 'M',
  });

  const item = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    ontvanger: parsed.ontvanger,
    naam: parsed.naam,
    iban: parsed.iban,
    bic: parsed.bic,
    bedrag: parsed.bedrag,
    mededeling: parsed.mededeling,
    mededeling_type: parsed.mededeling_type,
    factuur_nummer: parsed.factuur_nummer,
    vervaldatum: parsed.vervaldatum,
    qrcode: qrDataUrl,
    created: new Date().toISOString(),
    bron: 'codabox-inbound',
  };

  await redis.rpush(`factuur:queue:${userSub}`, JSON.stringify(item));

  return res.json({ ok: true, added: true, factuur: { naam: item.naam, bedrag: item.bedrag } });
};
