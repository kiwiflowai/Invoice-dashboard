const apiUrl = "https://6kl77b9h06.execute-api.ap-southeast-2.amazonaws.com/prod/upload";
const resultsApiUrl = "https://a8uoo3tjc6.execute-api.ap-southeast-2.amazonaws.com/prod/results";

let files = [];
let results = [];
let processingFiles = new Set();
let amountChart = null;

// DOM Elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
const clearBtn = document.getElementById('clearBtn');
const resultsContainer = document.getElementById('resultsContainer');
const clearResultsBtn = document.getElementById('clearResultsBtn');
const fetchResultsBtn = document.getElementById('fetchResultsBtn');
const notification = document.getElementById('notification');

// --------------------
// Utility Functions
// --------------------
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function getFileIcon(fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  const icons = { pdf: '📄', png: '🖼️', jpg: '🖼️', jpeg: '🖼️', tiff: '🖼️', tif: '🖼️', gif: '🖼️', bmp: '🖼️', webp: '🖼️' };
  return icons[ext] || '📎';
}

function showNotification(message, type = 'success') {
  notification.textContent = message;
  notification.className = `notification ${type} show`;
  setTimeout(() => notification.classList.remove('show'), 3000);
}

function updateStats() {
  document.getElementById('totalFiles').textContent = files.length;
  const processed = results.length;
  document.getElementById('processedFiles').textContent = processed;
  const success = results.filter(r => r.status === 'success').length;
  const rate = files.length > 0 ? Math.round((success / files.length) * 100) : 0;
  document.getElementById('successRate').textContent = rate + '%';
}

// --------------------
// File List & Upload
// --------------------
function renderFileList() {
  if (files.length === 0) { fileList.innerHTML = ''; return; }

  fileList.innerHTML = files.map((file, index) => {
    const isUploading = processingFiles.has(file.name);
    const result = results.find(r => r.fileName === file.name);
    const status = result ? (result.status === 'error' ? 'error' : 'success') : (isUploading ? 'uploading' : 'pending');
    const progress = file.uploadProgress || 0;

    return `
      <div class="file-item">
        <div class="file-info">
          <div class="file-icon">${getFileIcon(file.name)}</div>
          <div class="file-details">
            <div class="file-name">${file.name}</div>
            <div class="file-size">${formatFileSize(file.size)}</div>
            ${status === 'uploading' ? `<div class="progress-bar"><div class="progress-fill" style="width: ${progress}%"></div></div>` : ''}
          </div>
        </div>
        <div class="file-status">
          <span class="status-badge status-${status}">
            ${status === 'uploading' ? '<span class="spinner"></span> Uploading...' : status === 'success' ? '✓ Complete' : status === 'error' ? '✗ Error' : '⏳ Waiting'}
          </span>
          ${status !== 'uploading' ? `<button class="btn btn-remove" onclick="removeFile(${index})">Remove</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

window.removeFile = function(index) {
  files.splice(index, 1);
  renderFileList();
  updateStats();
};

clearBtn.addEventListener('click', () => { files = []; processingFiles.clear(); renderFileList(); updateStats(); });
clearResultsBtn.addEventListener('click', () => { results = []; renderResults(); updateStats(); renderVendorAnalytics(); });

uploadArea.addEventListener('click', () => fileInput.click());
uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
uploadArea.addEventListener('drop', (e) => {
  e.preventDefault(); uploadArea.classList.remove('dragover'); addFiles(Array.from(e.dataTransfer.files)); setTimeout(startAutoUpload, 500);
});
fileInput.addEventListener('change', (e) => { addFiles(Array.from(e.target.files)); setTimeout(startAutoUpload, 500); });

function addFiles(newFiles) {
  const validFiles = newFiles.filter(f => ['pdf','png','jpg','jpeg','tiff','tif','gif','bmp','webp'].includes(f.name.split('.').pop().toLowerCase()));
  if (validFiles.length !== newFiles.length) showNotification('Some files skipped. Only PDF/images supported.', 'error');
  files.push(...validFiles); renderFileList(); updateStats();
}

async function startAutoUpload() {
  const toUpload = files.filter(f => !processingFiles.has(f.name) && !results.some(r => r.fileName === f.name));
  if (toUpload.length === 0) return;
  const batchSize = 3;
  for (let i=0;i<toUpload.length;i+=batchSize){ const batch = toUpload.slice(i,i+batchSize); await Promise.all(batch.map(uploadFile)); }
}

async function uploadFile(file) {
  processingFiles.add(file.name); file.uploadProgress = 0; renderFileList();
  try {
    const res = await fetch(apiUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: file.name, fileType: file.type }) });
    if (!res.ok) throw new Error('Upload failed');
    const data = await res.json();
    if (!data.uploadUrl) throw new Error('Upload failed');
    file.uploadProgress = 50; renderFileList();
    const uploadRes = await fetch(data.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
    if (!uploadRes.ok) throw new Error('Upload failed');
    file.uploadProgress = 100; processingFiles.delete(file.name); renderFileList();
    addResult({ fileName: file.name, status: 'success', text: 'Processing in Lambda. Full results will appear once ready.', note: 'OCR results pending.' });
  } catch (err) {
    processingFiles.delete(file.name); file.uploadProgress = 0; renderFileList();
    addResult({ fileName: file.name, status: 'error', text: 'Upload failed. Please try again.' });
  }
}

// --------------------
// Results & Dashboard
// --------------------
function addResult(result) {
  results.push(result); renderResults(); updateStats(); updateVisualization(); renderVendorAnalytics();
}

function renderResults() {
  if (!results.length) { resultsContainer.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📄</div><p>No results yet. Upload files or fetch from DynamoDB.</p></div>`; return; }
  resultsContainer.innerHTML = results.map(r => `
    <div class="result-item">
      <div class="result-header">
        <div class="result-title">${getFileIcon(r.fileName)} ${r.fileName}</div>
        <span class="status-badge status-${r.status}">${r.status==='success'?'✓ Success':'✗ Error'}</span>
      </div>
      <p style="color:#666; font-size:.85rem;">Processed: ${r.timestamp ? new Date(r.timestamp).toLocaleString() : 'N/A'}</p>
      <div class="result-content">${r.text}</div>
      ${r.note?`<p style="color:#666; font-size:.9rem;">${r.note}</p>`:''}
    </div>
  `).join('');
}

async function fetchResultsFromDynamoDB() {
  try {
    fetchResultsBtn.disabled = true; fetchResultsBtn.innerHTML = '<span class="spinner"></span> Fetching...';
    const response = await fetch(resultsApiUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    results = [];
    if (data.results && data.results.length > 0) {
      data.results.forEach(item => addResult({ fileName: item.filename, status: 'success', text: item.summary || '', timestamp: item.timestamp }));
      showNotification(`✓ Fetched ${data.results.length} result(s) from DynamoDB`, 'success');
    } else showNotification('No results found in DynamoDB', 'error');
  } catch (err) { console.error(err); showNotification(`✗ Error fetching results: ${err.message}`, 'error'); }
  finally { fetchResultsBtn.disabled = false; fetchResultsBtn.innerHTML = '<span>📊 Load Analytics Data</span>'; }
}

fetchResultsBtn.addEventListener('click', fetchResultsFromDynamoDB);

// --------------------
// Visualization
// --------------------
function updateVisualization() {
  const amounts = results.map(r => parseFloat(r.totalAmount)||0).filter(a=>a>0);
  const labels = results.map(r=>r.fileName.length>20?r.fileName.substring(0,20)+'...':r.fileName);
  if (!amountChart) { const ctx=document.getElementById('amountChart'); if(ctx) { amountChart=new Chart(ctx,{type:'bar',data:{labels, datasets:[{label:'Total Amount',data:amounts,backgroundColor:'rgba(102,126,234,0.8)',borderColor:'rgba(102,126,234,1)',borderWidth:2,borderRadius:8}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}}}});} return; }
  amountChart.data.labels=labels; amountChart.data.datasets[0].data=amounts; amountChart.update();
}

// --------------------
// Init
// --------------------
updateStats();
renderFileList();
renderResults();
