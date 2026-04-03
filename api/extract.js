const Anthropic = require('@anthropic-ai/sdk');
const { IncomingForm } = require('formidable');
const fs = require('fs');

// Disable default body parsing for file uploads
export const config = {
  api: { bodyParser: false }
};

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({
      maxFileSize: 10 * 1024 * 1024,
      filter: ({ mimetype }) => {
        return ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'].includes(mimetype);
      }
    });
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { files } = await parseForm(req);
    const file = files.invoice?.[0] || files.invoice;

    if (!file) {
      return res.status(400).json({ error: 'Geen bestand geüpload' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY niet geconfigureerd' });
    }

    const client = new Anthropic({ apiKey });
    const fileBuffer = fs.readFileSync(file.filepath || file.path);
    const base64Image = fileBuffer.toString('base64');
    const mediaType = file.mimetype || file.type;

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

    let invoiceData;
    try {
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
};
