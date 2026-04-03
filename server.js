require('dotenv').config();
const express = require('express');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Multer setup for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Ongeldig bestandstype. Upload een afbeelding of PDF.'));
    }
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Extract invoice data using Claude Vision
app.post('/api/extract', upload.single('invoice'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Geen bestand geüpload' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY niet geconfigureerd' });
    }

    const client = new Anthropic({ apiKey });
    const base64Image = req.file.buffer.toString('base64');
    const mediaType = req.file.mimetype;

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Image
              }
            },
            {
              type: 'text',
              text: `Analyseer deze Belgische factuur en extraheer de volgende gegevens in JSON formaat:
{
  "naam": "naam van de ontvanger/begunstigde (het bedrijf dat betaald moet worden)",
  "iban": "IBAN rekeningnummer (formaat: BE## #### #### ####)",
  "bic": "BIC/SWIFT code (indien zichtbaar, anders leeglaten)",
  "bedrag": "totaal te betalen bedrag als nummer (bijv. 125.50)",
  "mededeling": "gestructureerde mededeling (formaat: +++###/####/#####+++  of  ***###/####/#####***) OF vrije mededeling",
  "mededeling_type": "gestructureerd" of "vrij",
  "vervaldatum": "vervaldatum indien zichtbaar (DD/MM/YYYY)",
  "factuur_nummer": "factuurnummer indien zichtbaar"
}

Belangrijk:
- Zoek specifiek naar de gestructureerde mededeling (12 cijfers in het formaat +++###/####/#####+++).
- Het IBAN is een Belgisch rekeningnummer (begint met BE).
- Het bedrag is het totaal inclusief BTW.
- Antwoord ENKEL met het JSON object, geen extra tekst.`
            }
          ]
        }
      ]
    });

    const responseText = message.content[0].text;

    // Parse the JSON from Claude's response
    let invoiceData;
    try {
      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        invoiceData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Geen JSON gevonden in antwoord');
      }
    } catch (parseError) {
      return res.status(500).json({
        error: 'Kon factuurgegevens niet parseren',
        raw: responseText
      });
    }

    res.json({ success: true, data: invoiceData });
  } catch (error) {
    console.error('Extract error:', error);
    res.status(500).json({ error: error.message || 'Fout bij het verwerken van de factuur' });
  }
});

// Generate EPC QR code
app.post('/api/qrcode', async (req, res) => {
  try {
    const { naam, iban, bic, bedrag, mededeling, mededeling_type } = req.body;

    if (!iban || !bedrag || !naam) {
      return res.status(400).json({ error: 'IBAN, bedrag en naam zijn verplicht' });
    }

    // Clean IBAN (remove spaces)
    const cleanIban = iban.replace(/\s/g, '');

    // Clean amount - ensure 2 decimal places
    const cleanAmount = parseFloat(bedrag).toFixed(2);

    // Clean structured communication - extract just the digits
    let reference = '';
    let freeText = '';

    if (mededeling_type === 'gestructureerd' && mededeling) {
      // Extract 12 digits from structured communication
      const digits = mededeling.replace(/[^0-9]/g, '');
      if (digits.length === 12) {
        reference = digits;
      }
    } else if (mededeling) {
      freeText = mededeling;
    }

    // Build EPC QR code payload (European Payments Council standard)
    // See: https://www.europeanpaymentscouncil.eu/document-library/guidance-documents/quick-response-code-guidelines
    const lines = [
      'BCD',                    // Service Tag
      '002',                    // Version
      '1',                      // Character set (UTF-8)
      'SCT',                    // Identification (SEPA Credit Transfer)
      bic || '',                // BIC (optional in SEPA zone)
      naam.substring(0, 70),    // Beneficiary name (max 70 chars)
      cleanIban,                // IBAN
      `EUR${cleanAmount}`,      // Amount
      '',                       // Purpose (empty)
      reference,                // Structured reference (RF or Belgian structured communication)
      freeText.substring(0, 140), // Unstructured remittance info (max 140)
      ''                        // Beneficiary to originator info
    ];

    const epcPayload = lines.join('\n');

    // Generate QR code as data URL
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
});

app.listen(PORT, () => {
  console.log(`Factuur Scanner draait op http://localhost:${PORT}`);
});
