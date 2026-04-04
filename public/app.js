// DOM elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const cameraInput = document.getElementById('cameraInput');
const cameraBtn = document.getElementById('cameraBtn');
const preview = document.getElementById('preview');
const previewImage = document.getElementById('previewImage');
const removeFile = document.getElementById('removeFile');
const scanBtn = document.getElementById('scanBtn');
const uploadError = document.getElementById('uploadError');

const stepUpload = document.getElementById('step-upload');
const stepReview = document.getElementById('step-review');
const stepDone = document.getElementById('step-done');
const loading = document.getElementById('loading');

let selectedFile = null;

// --- Step 1: File Upload ---

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
});

cameraBtn.addEventListener('click', () => {
  cameraInput.click();
});

cameraInput.addEventListener('change', (e) => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
});

removeFile.addEventListener('click', () => {
  selectedFile = null;
  preview.style.display = 'none';
  scanBtn.style.display = 'none';
  dropZone.style.display = '';
  uploadError.style.display = 'none';
  fileInput.value = '';
  cameraInput.value = '';
});

function handleFile(file) {
  if (file.size > 10 * 1024 * 1024) {
    showError('Bestand is te groot (max 10MB)');
    return;
  }

  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
  if (!allowed.includes(file.type)) {
    showError('Ongeldig bestandstype. Upload een afbeelding of PDF.');
    return;
  }

  selectedFile = file;
  uploadError.style.display = 'none';

  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImage.src = e.target.result;
      preview.style.display = '';
    };
    reader.readAsDataURL(file);
  } else {
    previewImage.src = 'data:image/svg+xml,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">' +
      '<rect width="200" height="200" fill="#f5f7fa" rx="8"/>' +
      '<text x="100" y="90" text-anchor="middle" font-size="48">📄</text>' +
      '<text x="100" y="130" text-anchor="middle" font-size="14" fill="#7f8c8d">' + file.name + '</text>' +
      '</svg>'
    );
    preview.style.display = '';
  }

  dropZone.style.display = 'none';
  scanBtn.style.display = '';
}

function showError(msg) {
  uploadError.textContent = msg;
  uploadError.style.display = '';
}

// Manual entry button
document.getElementById('manualBtn').addEventListener('click', () => {
  document.getElementById('naam').value = '';
  document.getElementById('iban').value = '';
  document.getElementById('bic').value = '';
  document.getElementById('bedrag').value = '';
  document.getElementById('mededeling').value = '';
  document.getElementById('vervaldatum').value = '';
  document.getElementById('factuur_nummer').value = '';
  stepUpload.style.display = 'none';
  stepReview.style.display = '';
});

// --- Scan Button (AI extract) ---
scanBtn.addEventListener('click', async () => {
  if (!selectedFile) return;

  stepUpload.style.display = 'none';
  loading.style.display = '';

  try {
    const formData = new FormData();
    formData.append('invoice', selectedFile);

    const response = await fetch('/api/extract', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Fout bij het scannen');
    }

    populateForm(result.data);
    loading.style.display = 'none';
    stepReview.style.display = '';
  } catch (error) {
    loading.style.display = 'none';
    stepUpload.style.display = '';
    showError(error.message || 'Er ging iets mis bij het scannen. Probeer opnieuw.');
  }
});

// --- Step 2: Review & Edit ---

function populateForm(data) {
  document.getElementById('naam').value = data.naam || '';
  document.getElementById('iban').value = data.iban || '';
  document.getElementById('bic').value = data.bic || '';
  document.getElementById('bedrag').value = data.bedrag || '';
  document.getElementById('mededeling').value = data.mededeling || '';
  document.getElementById('vervaldatum').value = data.vervaldatum || '';
  document.getElementById('factuur_nummer').value = data.factuur_nummer || '';

  const type = data.mededeling_type || 'gestructureerd';
  const radio = document.querySelector(`input[name="mededeling_type"][value="${type}"]`);
  if (radio) radio.checked = true;
  updateMededelingHint(type);
}

document.querySelectorAll('input[name="mededeling_type"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    updateMededelingHint(e.target.value);
  });
});

function updateMededelingHint(type) {
  const hint = document.getElementById('mededelingHint');
  const input = document.getElementById('mededeling');
  if (type === 'gestructureerd') {
    hint.textContent = 'Formaat: +++###/####/#####+++';
    input.placeholder = '+++123/4567/89012+++';
  } else {
    hint.textContent = 'Vrije tekst als mededeling';
    input.placeholder = 'Factuur 2024-001';
  }
}

document.getElementById('backBtn').addEventListener('click', () => {
  stepReview.style.display = 'none';
  stepUpload.style.display = '';
});

// --- Step 3: Add to Queue ---

document.getElementById('generateQrBtn').addEventListener('click', async () => {
  const naam = document.getElementById('naam').value.trim();
  const iban = document.getElementById('iban').value.trim();
  const bic = document.getElementById('bic').value.trim();
  const bedrag = document.getElementById('bedrag').value.trim();
  const mededeling = document.getElementById('mededeling').value.trim();
  const mededeling_type = document.querySelector('input[name="mededeling_type"]:checked').value;
  const factuur_nummer = document.getElementById('factuur_nummer').value.trim();
  const vervaldatum = document.getElementById('vervaldatum').value.trim();

  // Validation
  if (!naam) { showToast('Vul de naam van de begunstigde in'); return; }
  if (!iban) { showToast('Vul het IBAN rekeningnummer in'); return; }
  if (!bedrag || parseFloat(bedrag) <= 0) { showToast('Vul een geldig bedrag in'); return; }

  const btn = document.getElementById('generateQrBtn');
  btn.disabled = true;
  btn.textContent = 'Toevoegen...';

  try {
    const response = await fetch('/api/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ naam, iban, bic, bedrag, mededeling, mededeling_type, factuur_nummer, vervaldatum })
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error);
    }

    // Show confirmation
    document.getElementById('summaryNaam').textContent = naam;
    document.getElementById('summaryIban').textContent = iban;
    document.getElementById('summaryBedrag').textContent = `€ ${parseFloat(bedrag).toFixed(2)}`;
    document.getElementById('summaryMededeling').textContent = mededeling || '-';

    // Get queue count
    try {
      const queueRes = await fetch('/api/queue');
      const queueData = await queueRes.json();
      document.getElementById('queueCount').textContent = queueData.items ? queueData.items.length : '?';
    } catch (e) {
      document.getElementById('queueCount').textContent = '?';
    }

    stepReview.style.display = 'none';
    stepDone.style.display = '';

    showToast('Factuur toegevoegd aan wachtrij!');
  } catch (error) {
    showToast(error.message || 'Fout bij toevoegen aan wachtrij');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Toevoegen aan wachtrij →';
  }
});

// Scan next invoice
document.getElementById('scanNextBtn').addEventListener('click', () => {
  resetToStart();
});

function resetToStart() {
  selectedFile = null;
  preview.style.display = 'none';
  scanBtn.style.display = 'none';
  dropZone.style.display = '';
  uploadError.style.display = 'none';
  fileInput.value = '';
  cameraInput.value = '';
  stepDone.style.display = 'none';
  stepReview.style.display = 'none';
  stepUpload.style.display = '';
}

// --- Toast ---
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.display = '';
  setTimeout(() => {
    toast.style.display = 'none';
  }, 2500);
}
