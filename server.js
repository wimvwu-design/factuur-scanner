require('dotenv').config({ path: require('path').join(__dirname, '.env') });
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
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
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
              text: `Je bent een expert in het lezen van Belgische facturen. Analyseer deze factuur zeer grondig en extraheer alle betalingsgegevens.

Antwoord in dit exacte JSON formaat:
{
  "ontvanger": "aan wie is de factuur gericht (naam van de persoon of het bedrijf dat moet betalen)",
  "naam": "naam van de afzender/begunstigde (het bedrijf dat betaald moet worden)",
  "iban": "IBAN rekeningnummer",
  "bic": "BIC/SWIFT code (indien zichtbaar, anders leeglaten)",
  "bedrag": "totaal te betalen bedrag als nummer (bijv. 125.50)",
  "mededeling": "gestructureerde mededeling OF vrije mededeling",
  "mededeling_type": "gestructureerd" of "vrij",
  "vervaldatum": "vervaldatum indien zichtbaar (DD/MM/YYYY)",
  "factuur_nummer": "factuurnummer indien zichtbaar"
}

CRUCIALE INSTRUCTIES VOOR HET IBAN:
- LEES DE VOLLEDIGE FACTUUR INCLUSIEF ALLE KLEINE TEKST ONDERAAN EN IN DE FOOTER.
- Het IBAN staat vaak NIET in een apart veld, maar in een lopende zin zoals: "betaling op ons nummer BE## #### #### ####" of "te betalen op rekening BE## #### #### ####" of "IBAN: BE## #### #### ####".
- Zoek naar elk patroon dat begint met 2 letters gevolgd door 14-16 cijfers (bijv. BE68539007547034 of BE68 5390 0754 7034).
- Belgische IBANs beginnen met BE en hebben 16 tekens (bijv. BE68 5390 0754 7034).
- Nederlandse IBANs beginnen met NL en hebben 18 tekens.
- Het IBAN kan met of zonder spaties geschreven zijn. Geef het terug MET spaties (bijv. BE68 5390 0754 7034).
- Zoek in ALLE tekst op de factuur: betalingsoverzicht, voettekst, kleine lettertjes, adresgegevens van het bedrijf, overschrijvingsformulier.
- Als er meerdere IBANs staan, kies het IBAN dat bij de betaalinstructie hoort (niet het IBAN van de klant).
- Als je het IBAN nergens vindt, zoek dan naar termen als "rekeningnummer", "bankrekeningnummer", "op ons nummer", "BNP", "KBC", "ING", "Belfius" gevolgd door een rekeningnummer.

INSTRUCTIES VOOR ONTVANGER:
- De ontvanger is de persoon of het bedrijf AAN WIE de factuur gericht is (de klant die moet betalen).
- Zoek naar het leveringsadres, "Aan:", "Klant:", "Factuur aan:", of de naam bovenaan de factuur naast het adres.
- Dit is NIET de afzender/begunstigde, maar de geadresseerde.

INSTRUCTIES VOOR MEDEDELING:
- Zoek naar gestructureerde mededeling: 12 cijfers in het formaat +++###/####/#####+++ of ***###/####/#####***.
- Als er geen gestructureerde mededeling is, zoek naar een vrije mededeling of factuurreferentie.

INSTRUCTIES VOOR BEDRAG:
- Het bedrag is het TOTAAL inclusief BTW (het eindbedrag dat betaald moet worden).
- Geef het als getal met 2 decimalen (bijv. 125.50), zonder valutateken.

Antwoord ENKEL met het JSON object, geen extra tekst of uitleg.`
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

// Queue endpoint - proxy to the serverless function for local dev
const queueHandler = require('./api/queue');
app.get('/api/queue', (req, res) => queueHandler(req, res));
app.post('/api/queue', (req, res) => queueHandler(req, res));

app.listen(PORT, () => {
  console.log(`Genius Pay draait op http://localhost:${PORT}`);
});
