const { Redis } = require('@upstash/redis');
const QRCode = require('qrcode');
const { requireAuth } = require('./_auth');

function getRedis() {
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

function userQueueKey(userId) {
  return `factuur:queue:${userId}`;
}

function generateEpcPayload({ naam, iban, bic, bedrag, mededeling, mededeling_type }) {
  const cleanIban = iban.replace(/\s/g, '');
  const cleanAmount = parseFloat(bedrag).toFixed(2);

  let reference = '';
  let freeText = '';

  if (mededeling_type === 'gestructureerd' && mededeling) {
    const digits = mededeling.replace(/[^0-9]/g, '');
    if (digits.length === 12) {
      reference = digits;
    }
  } else if (mededeling) {
    freeText = mededeling;
  }

  const lines = [
    'BCD', '002', '1', 'SCT',
    bic || '',
    naam.substring(0, 70),
    cleanIban,
    `EUR${cleanAmount}`,
    '',
    reference,
    freeText.substring(0, 140),
    ''
  ];

  return lines.join('\n');
}

module.exports = async function handler(req, res) {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return res.status(500).json({ error: 'Redis niet geconfigureerd' });
  }

  // Authenticate user
  const user = await requireAuth(req, res);
  if (!user) return; // 401 already sent

  const redis = getRedis();
  const QUEUE_KEY = userQueueKey(user.sub);

  // GET - List all pending QR codes for this user
  if (req.method === 'GET') {
    try {
      const items = await redis.lrange(QUEUE_KEY, 0, -1);
      const parsed = items.map(item => {
        if (typeof item === 'string') return JSON.parse(item);
        return item;
      });
      return res.json({ success: true, items: parsed, user: { email: user.email, name: user.name, picture: user.picture } });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // POST - Add or remove from queue
  if (req.method === 'POST') {
    const { action } = req.body;

    // Remove a processed item
    if (action === 'done') {
      try {
        const { id } = req.body;
        if (!id) return res.status(400).json({ error: 'ID is verplicht' });

        const items = await redis.lrange(QUEUE_KEY, 0, -1);
        await redis.del(QUEUE_KEY);

        let removed = false;
        for (const item of items) {
          const parsed = typeof item === 'string' ? JSON.parse(item) : item;
          if (parsed.id === id && !removed) {
            removed = true;
            continue;
          }
          await redis.rpush(QUEUE_KEY, JSON.stringify(parsed));
        }

        return res.json({ success: true, removed });
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    }

    // Add new item to queue
    try {
      const { ontvanger, naam, iban, bic, bedrag, mededeling, mededeling_type, factuur_nummer, vervaldatum } = req.body;

      if (!naam || !iban || !bedrag) {
        return res.status(400).json({ error: 'Naam, IBAN en bedrag zijn verplicht' });
      }

      const epcPayload = generateEpcPayload({ naam, iban, bic, bedrag, mededeling, mededeling_type });
      const qrDataUrl = await QRCode.toDataURL(epcPayload, {
        width: 400,
        margin: 2,
        errorCorrectionLevel: 'M'
      });

      const item = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        ontvanger: ontvanger || '',
        naam,
        iban,
        bic: bic || '',
        bedrag: parseFloat(bedrag).toFixed(2),
        mededeling: mededeling || '',
        mededeling_type: mededeling_type || 'vrij',
        factuur_nummer: factuur_nummer || '',
        vervaldatum: vervaldatum || '',
        qrcode: qrDataUrl,
        created: new Date().toISOString()
      };

      await redis.rpush(QUEUE_KEY, JSON.stringify(item));

      return res.json({ success: true, item });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
