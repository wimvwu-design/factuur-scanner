const QRCode = require('qrcode');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { naam, iban, bic, bedrag, mededeling, mededeling_type } = req.body;

    if (!iban || !bedrag || !naam) {
      return res.status(400).json({ error: 'IBAN, bedrag en naam zijn verplicht' });
    }

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

    // EPC QR code payload (European Payments Council standard)
    const lines = [
      'BCD',
      '002',
      '1',
      'SCT',
      bic || '',
      naam.substring(0, 70),
      cleanIban,
      `EUR${cleanAmount}`,
      '',
      reference,
      freeText.substring(0, 140),
      ''
    ];

    const epcPayload = lines.join('\n');

    const qrDataUrl = await QRCode.toDataURL(epcPayload, {
      width: 400,
      margin: 2,
      errorCorrectionLevel: 'M'
    });

    res.json({
      success: true,
      qrcode: qrDataUrl,
      payload: epcPayload
    });
  } catch (error) {
    console.error('QR error:', error);
    res.status(500).json({ error: error.message || 'Fout bij het genereren van de QR-code' });
  }
};
