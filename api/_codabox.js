function htmlToText(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|tr|td|th|li|h\d)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n /g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

function extractField(text, pattern) {
  const match = text.match(pattern);
  return match ? match[1].trim() : null;
}

function formatIban(iban) {
  const clean = iban.replace(/\s/g, '');
  return clean.replace(/(.{4})/g, '$1 ').trim();
}

function formatStructuredRef(digits) {
  if (digits.length !== 12) return digits;
  return `+++${digits.substr(0, 3)}/${digits.substr(3, 4)}/${digits.substr(7, 5)}+++`;
}

function parseCodaboxEmail(body) {
  if (!body) return null;
  const text = body.includes('<') ? htmlToText(body) : body;

  if (/Betaald via domiciliering\s*\[X\]/i.test(text)) {
    return { paid: true };
  }

  const leverancier = extractField(text, /Leverancier:\s*(.+?)(?:\n|Bedrag)/);
  const bedragRaw = extractField(text, /Bedrag:\s*([\d.,]+)/);
  const betaalRef = extractField(text, /Betaal referentie:\s*(\S+)/);
  const rekeningnummer = extractField(text, /Rekeningnummer:\s*(\S+)/);
  const factuurRef = extractField(text, /Factuurreferentie:\s*(\S+)/);
  const vervaldag = extractField(text, /Vervaldag:\s*(\S+)/);
  const ontvanger = extractField(text, /factuur die aan (.+?) is gericht/);

  if (!leverancier || !bedragRaw || !rekeningnummer) {
    return null;
  }

  const refDigits = betaalRef ? betaalRef.replace(/[^0-9]/g, '') : '';
  const isStructured = refDigits.length === 12;

  let vervaldatumFormatted = '';
  if (vervaldag) {
    const match = vervaldag.match(/(\d{4})-(\d{2})-(\d{2})/);
    vervaldatumFormatted = match ? `${match[3]}/${match[2]}/${match[1]}` : vervaldag;
  }

  return {
    paid: false,
    ontvanger: ontvanger || '',
    naam: leverancier,
    iban: formatIban(rekeningnummer),
    bic: '',
    bedrag: parseFloat(bedragRaw.replace(',', '.')).toFixed(2),
    mededeling: isStructured ? formatStructuredRef(refDigits) : (betaalRef || ''),
    mededeling_type: isStructured ? 'gestructureerd' : 'vrij',
    factuur_nummer: factuurRef || '',
    vervaldatum: vervaldatumFormatted,
  };
}

function generateEpcPayload({ naam, iban, bic, bedrag, mededeling, mededeling_type }) {
  const cleanIban = iban.replace(/\s/g, '');
  const cleanAmount = parseFloat(bedrag).toFixed(2);

  let reference = '';
  let freeText = '';

  if (mededeling_type === 'gestructureerd' && mededeling) {
    const digits = mededeling.replace(/[^0-9]/g, '');
    if (digits.length === 12) reference = digits;
    else freeText = mededeling;
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

module.exports = { parseCodaboxEmail, generateEpcPayload };
