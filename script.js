document.addEventListener('DOMContentLoaded', () => {
  const apiUrl = "https://6kl77b9h06.execute-api.ap-southeast-2.amazonaws.com/prod/upload";
  const resultsApiUrl = "https://a8uoo3tjc6.execute-api.ap-southeast-2.amazonaws.com/prod/results";

  let files = [];
  let results = [];
  let processingFiles = new Set();

  // DOM Elements
  const uploadArea = document.getElementById('uploadArea');
  const fileInput = document.getElementById('fileInput');
  const fileList = document.getElementById('fileList');
  const clearBtn = document.getElementById('clearBtn');
  const resultsContainer = document.getElementById('resultsContainer');
  const clearResultsBtn = document.getElementById('clearResultsBtn');
  const fetchResultsBtn = document.getElementById('fetchResultsBtn');
  const notification = document.getElementById('notification');

  // -------------------- Utilities --------------------
  function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024, sizes = ['Bytes','KB','MB','GB'];
    const i = Math.floor(Math.log(bytes)/Math.log(k));
    return (bytes/Math.pow(k,i)).toFixed(2) + ' ' + sizes[i];
  }

  function getFileIcon(fileName){
    const ext = fileName.split('.').pop().toLowerCase();
    const icons = { pdf:'📄', png:'🖼️', jpg:'🖼️', jpeg:'🖼️', tiff:'🖼️', tif:'🖼️', gif:'🖼️', bmp:'🖼️', webp:'🖼️' };
    return icons[ext] || '📎';
  }

  function showNotification(msg, type='success') {
    notification.textContent = msg;
    notification.className = `notification ${type} show`;
    setTimeout(()=>notification.classList.remove('show'),3000);
  }

  function updateStats(){
    document.getElementById('totalFiles').textContent = files.length;
    document.getElementById('processedFiles').textContent = results.length;
    const success = results.filter(r=>r.status==='success').length;
    const rate = files.length>0?Math.round((success/files.length)*100):0;
    document.getElementById('successRate').textContent = rate+'%';
  }

  // -------------------- File List Rendering --------------------
  function renderFileList(){
    if(!files.length){ fileList.innerHTML=''; return; }
    fileList.innerHTML = files.map((f,i)=>{
      const isUploading = processingFiles.has(f.name);
      const r = results.find(r=>r.fileName===f.name);
      const status = r? (r.status==='error'?'error':'success') : (isUploading?'uploading':'pending');
      const progress = f.uploadProgress||0;
      return `
        <div class="file-item">
          <div class="file-info">
            <div class="file-icon">${getFileIcon(f.name)}</div>
            <div class="file-details">
              <div class="file-name">${f.name}</div>
              <div class="file-size">${formatFileSize(f.size)}</div>
              ${status==='uploading'?`<div class="progress-bar"><div class="progress-fill" style="width:${progress}%"></div></div>`:''}
            </div>
          </div>
          <div class="file-status">
            <span class="status-badge status-${status}">
              ${status==='uploading'?'<span class="spinner"></span> Uploading...':status==='success'?'✓ Complete':'✗ Error'}
            </span>
            ${status!=='uploading'?`<button class="btn btn-remove" onclick="removeFile(${i})">Remove</button>`:''}
          </div>
        </div>
      `;
    }).join('');
    updateStats();
  }

  window.removeFile = i=>{ files.splice(i,1); renderFileList(); };

  // -------------------- File Actions --------------------
  clearBtn.addEventListener('click', ()=>{ files=[]; processingFiles.clear(); renderFileList(); });
  clearResultsBtn.addEventListener('click', ()=>{ results=[]; renderResults(); });

  uploadArea.addEventListener('click', ()=>fileInput.click());
  uploadArea.addEventListener('dragover', e=>{ e.preventDefault(); uploadArea.classList.add('dragover'); });
  uploadArea.addEventListener('dragleave', ()=>uploadArea.classList.remove('dragover'));
  uploadArea.addEventListener('drop', e=>{ e.preventDefault(); uploadArea.classList.remove('dragover'); addFiles(Array.from(e.dataTransfer.files)); });
  fileInput.addEventListener('change', e=>addFiles(Array.from(e.target.files)));

  function addFiles(newFiles){
    const validExts = ['.pdf','.png','.jpg','.jpeg','.tiff','.tif','.gif','.bmp','.webp'];
    const validFiles = newFiles.filter(f=>validExts.includes('.'+f.name.split('.').pop().toLowerCase()));
    if(validFiles.length!==newFiles.length) showNotification('Some files skipped. Only PDF/image allowed','error');
    files.push(...validFiles);
    renderFileList();
    startAutoUpload();
  }

  // -------------------- Upload Files --------------------
  async function startAutoUpload(){
    const batch = files.filter(f=>!processingFiles.has(f.name)&&!results.some(r=>r.fileName===f.name));
    for(const f of batch) await uploadFile(f);
  }

  async function uploadFile(file){
    processingFiles.add(file.name);
    file.uploadProgress=50;
    renderFileList();

    try{
      const res = await fetch(apiUrl, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({fileName:file.name,fileType:file.type})
      });
      const {uploadUrl} = await res.json();

      await fetch(uploadUrl,{ method:'PUT', headers:{'Content-Type':file.type}, body:file });

      file.uploadProgress=100;
      processingFiles.delete(file.name);

      // ✅ Add a placeholder summary so it renders
      addResult({
        fileName:file.name,
        status:'success',
        summary:'Summary is being generated. Refresh to see final summary from DynamoDB.',
        note:'Placeholder summary. Final summary appears after Lambda completes.',
        processedAt:new Date().toISOString(),
        totalAmount:null,
        currency:'$'
      });

    }catch(err){
      processingFiles.delete(file.name);
      addResult({
        fileName:file.name,
        status:'error',
        summary:'Upload failed',
        note:'',
        processedAt:new Date().toISOString(),
        totalAmount:null,
        currency:'$'
      });
    }

    renderFileList();
  }

  // -------------------- Render Results (Summary Only) --------------------
  function renderResults(){
    if(!results.length){
      resultsContainer.innerHTML='<div class="empty-state">📄 No summaries yet. Upload files or fetch from DynamoDB.</div>';
      return;
    }
    resultsContainer.innerHTML = results.map(r=>`
      <div class="result-item">
        <div class="result-header">
          ${getFileIcon(r.fileName)} ${r.fileName} 
          <span class="status-badge status-${r.status}">${r.status==='success'?'✓ Success':'✗ Error'}</span>
        </div>
        ${r.processedAt?`<p style="color:#666;font-size:0.85rem;">Processed: ${new Date(r.processedAt).toLocaleString()}</p>`:''}
        ${r.totalAmount!=null?`<p style="color:#667eea;font-weight:600;">Total Amount: ${r.currency||'$'}${r.totalAmount.toFixed(2)}</p>`:''}
        ${r.summary?`<div class="summary-tab" style="padding:12px;border:1px solid #667eea;border-radius:6px;background-color:#f5f7ff;"><strong>Invoice Summary:</strong><pre style="white-space:pre-wrap;margin:6px 0 0 0;">${r.summary}</pre></div>`:''}
        ${r.note?`<p style="color:#666;font-size:0.9rem;">${r.note}</p>`:''}
      </div>
    `).join('');
  }

  // -------------------- Fetch from DynamoDB --------------------
  fetchResultsBtn.addEventListener('click', async ()=>{
    fetchResultsBtn.disabled=true;
    fetchResultsBtn.innerHTML='<span class="spinner"></span> Fetching...';
    try{
      const res = await fetch(resultsApiUrl);
      const data = await res.json();
      const items = data.items||[];
      if(!items.length) return showNotification('No summaries found','error');

      results = [];
      items.forEach(item=>{
        addResult({
          fileName:item.filename||item.fileName||'Unknown',
          summary:item.summary||'No summary available',
          processedAt:item.timestamp||item.processedAt||null,
          totalAmount:item.totalAmount||null,
          currency:item.currency||'$',
          status:'success',
          note:'Fetched from DynamoDB'
        });
      });

      showNotification(`Fetched ${items.length} summaries from DynamoDB`,'success');
    }catch(err){
      console.error(err);
      showNotification(`Error fetching results: ${err.message}`,'error');
    }finally{
      fetchResultsBtn.disabled=false;
      fetchResultsBtn.innerHTML='<span>📊 Load Analytics Data</span>';
    }
  });

  function addResult(r){ results.push(r); renderResults(); updateStats(); }

  // -------------------- Init --------------------
  renderFileList();
  renderResults();
});
