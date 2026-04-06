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
const stepBulk = document.getElementById('step-bulk');
const loading = document.getElementById('loading');

let selectedFile = null;
let bulkMode = false;
let bulkFiles = []; // Collected files for bulk processing

// --- Mode Toggle ---
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    bulkMode = btn.dataset.mode === 'bulk';

    // Reset state when switching modes
    bulkFiles = [];
    updateBulkQueue();

    if (bulkMode) {
      fileInput.setAttribute('multiple', '');
      document.getElementById('uploadTitle').textContent = 'Facturen uploaden (bulk)';
      document.getElementById('uploadText').textContent = 'Sleep meerdere facturen hierheen of';
      document.getElementById('bulkQueueSection').style.display = '';
    } else {
      fileInput.removeAttribute('multiple');
      document.getElementById('uploadTitle').textContent = 'Factuur uploaden';
      document.getElementById('uploadText').textContent = 'Sleep een factuur hierheen of';
      document.getElementById('bulkQueueSection').style.display = 'none';
    }
  });
});

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
  if (bulkMode) {
    addToBulkQueue(Array.from(e.dataTransfer.files));
  } else {
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }
});

fileInput.addEventListener('change', (e) => {
  if (bulkMode && e.target.files.length > 0) {
    addToBulkQueue(Array.from(e.target.files));
    fileInput.value = '';
  } else if (e.target.files[0]) {
    handleFile(e.target.files[0]);
  }
});

cameraBtn.addEventListener('click', () => {
  cameraInput.click();
});

cameraInput.addEventListener('change', (e) => {
  if (e.target.files[0]) {
    if (bulkMode) {
      addToBulkQueue([e.target.files[0]]);
      cameraInput.value = '';
    } else {
      handleFile(e.target.files[0]);
    }
  }
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
  document.getElementById('ontvanger').value = '';
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

// --- Bulk Queue: collect files before processing ---

function addToBulkQueue(files) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
  let added = 0;
  files.forEach(f => {
    if (f.size <= 10 * 1024 * 1024 && allowed.includes(f.type)) {
      bulkFiles.push(f);
      added++;
    }
  });
  if (added === 0 && files.length > 0) {
    showToast('Geen geldige bestanden');
  } else if (added > 0) {
    showToast(`${added} ${added === 1 ? 'bestand' : 'bestanden'} toegevoegd`);
  }
  updateBulkQueue();
}

function updateBulkQueue() {
  const list = document.getElementById('bulkQueueList');
  const count = document.getElementById('bulkQueueCount');
  const startBtn = document.getElementById('bulkStartBtn');
  const clearBtn = document.getElementById('bulkClearBtn');

  if (!list) return;

  count.textContent = `${bulkFiles.length} ${bulkFiles.length === 1 ? 'bestand' : 'bestanden'} klaar`;

  if (bulkFiles.length === 0) {
    list.innerHTML = '<p class="bulk-queue-empty">Neem foto\'s of kies bestanden — ze verschijnen hier</p>';
    startBtn.style.display = 'none';
    clearBtn.style.display = 'none';
  } else {
    list.innerHTML = bulkFiles.map((f, i) => `
      <div class="bulk-queue-item">
        <span class="bulk-item-icon">📄</span>
        <span class="bulk-item-name">${escapeHtml(f.name)}</span>
        <button class="btn-remove-bulk" onclick="removeBulkFile(${i})">✕</button>
      </div>
    `).join('');
    startBtn.style.display = '';
    clearBtn.style.display = '';
  }
}

// Global so onclick works
window.removeBulkFile = function(index) {
  bulkFiles.splice(index, 1);
  updateBulkQueue();
};

document.getElementById('bulkStartBtn').addEventListener('click', () => {
  if (bulkFiles.length === 0) return;
  startBulkProcessing([...bulkFiles]);
  bulkFiles = [];
  updateBulkQueue();
});

document.getElementById('bulkClearBtn').addEventListener('click', () => {
  bulkFiles = [];
  updateBulkQueue();
});

// --- Scan Button (AI extract) - Single mode ---
scanBtn.addEventListener('click', async () => {
  if (!selectedFile) return;

  stepUpload.style.display = 'none';
  loading.style.display = '';
  document.getElementById('loadingText').textContent = 'Factuur wordt geanalyseerd...';
  document.getElementById('loadingSub').textContent = 'Dit kan enkele seconden duren';

  try {
    const formData = new FormData();
    formData.append('invoice', selectedFile);

    const response = await authFetch('/api/extract', {
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
  document.getElementById('ontvanger').value = data.ontvanger || '';
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

// --- Step 3: Add to Queue (Single mode) ---

document.getElementById('generateQrBtn').addEventListener('click', async () => {
  const ontvanger = document.getElementById('ontvanger').value.trim();
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
    const response = await authFetch('/api/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ontvanger, naam, iban, bic, bedrag, mededeling, mededeling_type, factuur_nummer, vervaldatum })
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
      const queueRes = await authFetch('/api/queue');
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

// --- Bulk Processing ---

async function startBulkProcessing(files) {
  // Filter valid files
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
  const validFiles = files.filter(f => f.size <= 10 * 1024 * 1024 && allowed.includes(f.type));

  if (validFiles.length === 0) {
    showError('Geen geldige bestanden gevonden');
    return;
  }

  // Show bulk progress
  stepUpload.style.display = 'none';
  stepBulk.style.display = '';
  document.getElementById('bulkActions').style.display = 'none';

  const resultsDiv = document.getElementById('bulkResults');
  const bar = document.getElementById('bulkBar');
  const status = document.getElementById('bulkStatus');

  // Initialize item list
  resultsDiv.innerHTML = validFiles.map((f, i) => `
    <div class="bulk-item" id="bulk-item-${i}">
      <span class="bulk-item-icon">📄</span>
      <span class="bulk-item-name">${escapeHtml(f.name)}</span>
      <span class="bulk-item-amount" id="bulk-amount-${i}"></span>
      <span class="bulk-item-status pending" id="bulk-status-${i}">Wachten...</span>
    </div>
  `).join('');

  let successCount = 0;
  let errorCount = 0;

  // Process each file sequentially
  for (let i = 0; i < validFiles.length; i++) {
    const file = validFiles[i];
    const statusEl = document.getElementById(`bulk-status-${i}`);
    const amountEl = document.getElementById(`bulk-amount-${i}`);

    statusEl.textContent = 'Scannen...';
    statusEl.className = 'bulk-item-status pending';
    status.textContent = `${i + 1} / ${validFiles.length} wordt verwerkt...`;
    bar.style.width = `${((i) / validFiles.length) * 100}%`;

    try {
      // Step 1: Extract data via AI
      const formData = new FormData();
      formData.append('invoice', file);

      const extractRes = await authFetch('/api/extract', { method: 'POST', body: formData });
      const extractResult = await extractRes.json();

      if (!extractResult.success) {
        throw new Error(extractResult.error || 'Scan mislukt');
      }

      const data = extractResult.data;

      // Check required fields
      if (!data.naam || !data.iban || !data.bedrag || parseFloat(data.bedrag) <= 0) {
        // Need manual review
        statusEl.textContent = 'Review nodig';
        statusEl.className = 'bulk-item-status error';

        const resolved = await showBulkReview(data, file.name);

        if (resolved) {
          const queueRes = await authFetch('/api/queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(resolved)
          });
          const queueResult = await queueRes.json();
          if (!queueResult.success) throw new Error(queueResult.error);

          statusEl.textContent = 'OK';
          statusEl.className = 'bulk-item-status success';
          amountEl.textContent = `€ ${parseFloat(resolved.bedrag).toFixed(2)}`;
          successCount++;
        } else {
          statusEl.textContent = 'Overgeslagen';
          statusEl.className = 'bulk-item-status error';
          errorCount++;
        }
        continue;
      }

      // Step 2: Add to queue directly
      const queueRes = await authFetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ontvanger: data.ontvanger || '',
          naam: data.naam,
          iban: data.iban,
          bic: data.bic || '',
          bedrag: data.bedrag,
          mededeling: data.mededeling || '',
          mededeling_type: data.mededeling_type || 'vrij',
          factuur_nummer: data.factuur_nummer || '',
          vervaldatum: data.vervaldatum || ''
        })
      });

      const queueResult = await queueRes.json();
      if (!queueResult.success) throw new Error(queueResult.error);

      statusEl.textContent = 'OK';
      statusEl.className = 'bulk-item-status success';
      amountEl.textContent = `€ ${parseFloat(data.bedrag).toFixed(2)}`;
      successCount++;

    } catch (error) {
      statusEl.textContent = 'Fout';
      statusEl.className = 'bulk-item-status error';
      errorCount++;
    }

    bar.style.width = `${((i + 1) / validFiles.length) * 100}%`;
  }

  // Done
  status.textContent = `Klaar: ${successCount} verwerkt, ${errorCount} fouten`;
  bar.style.width = '100%';

  resultsDiv.innerHTML += `
    <div class="bulk-done-summary">
      <div class="bulk-done-counter"><span>${successCount}</span> facturen toegevoegd</div>
    </div>
  `;
  document.getElementById('bulkActions').style.display = '';
}

function showBulkReview(data, filename) {
  return new Promise((resolve) => {
    const reviewDiv = document.getElementById('bulkReview');
    reviewDiv.style.display = '';

    populateForm(data);

    stepReview.style.display = '';
    stepBulk.querySelector('.bulk-progress').style.display = 'none';

    const qrBtn = document.getElementById('generateQrBtn');
    const backBtn = document.getElementById('backBtn');
    const origQrText = qrBtn.textContent;
    const origBackText = backBtn.textContent;
    qrBtn.textContent = 'Bevestigen & doorgaan →';
    backBtn.textContent = 'Overslaan';

    function cleanup() {
      qrBtn.removeEventListener('click', onConfirm);
      backBtn.removeEventListener('click', onSkip);
      qrBtn.textContent = origQrText;
      backBtn.textContent = origBackText;
      stepReview.style.display = 'none';
      reviewDiv.style.display = 'none';
      stepBulk.querySelector('.bulk-progress').style.display = '';
    }

    function onConfirm(e) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const result = {
        ontvanger: document.getElementById('ontvanger').value.trim(),
        naam: document.getElementById('naam').value.trim(),
        iban: document.getElementById('iban').value.trim(),
        bic: document.getElementById('bic').value.trim(),
        bedrag: document.getElementById('bedrag').value.trim(),
        mededeling: document.getElementById('mededeling').value.trim(),
        mededeling_type: document.querySelector('input[name="mededeling_type"]:checked').value,
        factuur_nummer: document.getElementById('factuur_nummer').value.trim(),
        vervaldatum: document.getElementById('vervaldatum').value.trim()
      };

      if (!result.naam || !result.iban || !result.bedrag) {
        showToast('Vul naam, IBAN en bedrag in');
        return;
      }

      cleanup();
      resolve(result);
    }

    function onSkip(e) {
      e.preventDefault();
      e.stopImmediatePropagation();
      cleanup();
      resolve(null);
    }

    qrBtn.addEventListener('click', onConfirm, { capture: true, once: true });
    backBtn.addEventListener('click', onSkip, { capture: true, once: true });
  });
}

// Bulk new scan button
document.getElementById('bulkNewBtn').addEventListener('click', () => {
  resetToStart();
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function resetToStart() {
  selectedFile = null;
  bulkFiles = [];
  preview.style.display = 'none';
  scanBtn.style.display = 'none';
  dropZone.style.display = '';
  uploadError.style.display = 'none';
  fileInput.value = '';
  cameraInput.value = '';
  stepDone.style.display = 'none';
  stepReview.style.display = 'none';
  stepBulk.style.display = 'none';
  stepUpload.style.display = '';
  updateBulkQueue();
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
