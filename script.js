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
// Upload button removed - using auto-upload
const clearBtn = document.getElementById('clearBtn');
const resultsContainer = document.getElementById('resultsContainer');
const clearResultsBtn = document.getElementById('clearResultsBtn');
const fetchResultsBtn = document.getElementById('fetchResultsBtn');
const notification = document.getElementById('notification');

// File size formatter
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Get file icon
function getFileIcon(fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  const icons = {
    pdf: '📄',
    png: '🖼️',
    jpg: '🖼️',
    jpeg: '🖼️',
    tiff: '🖼️',
    tif: '🖼️',
    gif: '🖼️',
    bmp: '🖼️',
    webp: '🖼️'
  };
  return icons[ext] || '📎';
}

// Show notification
function showNotification(message, type = 'success') {
  notification.textContent = message;
  notification.className = `notification ${type} show`;
  setTimeout(() => {
    notification.classList.remove('show');
  }, 3000);
}

// Update stats
function updateStats() {
  document.getElementById('totalFiles').textContent = files.length;
  const processed = results.length;
  document.getElementById('processedFiles').textContent = processed;
  const success = results.filter(r => r.status === 'success').length;
  const rate = files.length > 0 ? Math.round((success / files.length) * 100) : 0;
  document.getElementById('successRate').textContent = rate + '%';
}

    // Render file list with progress
    function renderFileList() {
      if (files.length === 0) {
        fileList.innerHTML = '';
        return;
      }

      const totalFiles = files.length;
      const uploadedCount = Array.from(processingFiles).length;
      const completedCount = results.filter(r => r.fileName && files.some(f => f.name === r.fileName)).length;
      const errorCount = results.filter(r => r.status === 'error' && r.fileName && files.some(f => f.name === r.fileName)).length;
      const pendingCount = totalFiles - uploadedCount - completedCount - errorCount;

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
                ${status === 'uploading' ? `
                  <div class="progress-bar" style="margin-top: 8px;">
                    <div class="progress-fill" style="width: ${progress}%"></div>
                  </div>
                ` : ''}
              </div>
            </div>
            <div class="file-status">
              <span class="status-badge status-${status}">
                ${status === 'uploading' ? '<span class="spinner"></span> Uploading...' : 
                  status === 'success' ? '✓ Complete' : 
                  status === 'error' ? '✗ Error' : 
                  '⏳ Waiting'}
              </span>
              ${status !== 'uploading' ? `<button class="btn btn-remove" onclick="removeFile(${index})">Remove</button>` : ''}
            </div>
          </div>
        `;
      }).join('');
      
      // Update upload progress text
      updateUploadProgress(totalFiles, completedCount, errorCount, uploadedCount, pendingCount);
    }
    
    // Update upload progress indicator
    function updateUploadProgress(total, completed, errors, uploading, pending) {
      const progressEl = document.getElementById('uploadProgress');
      if (!progressEl) return;
      
      if (total === 0) {
        progressEl.textContent = 'Ready to upload';
        return;
      }
      
      if (uploading > 0) {
        progressEl.textContent = `Uploading ${uploading} of ${total} files...`;
      } else if (pending > 0) {
        progressEl.textContent = `${pending} files pending, ${completed} completed`;
      } else if (completed === total) {
        progressEl.textContent = `✓ All ${total} files uploaded successfully`;
      } else {
        progressEl.textContent = `${completed} completed, ${errors} errors`;
      }
    }

// Remove file
window.removeFile = function(index) {
  files.splice(index, 1);
  renderFileList();
  updateStats();
};

// Clear all files
clearBtn.addEventListener('click', () => {
  files = [];
  processingFiles.clear();
  renderFileList();
  updateStats();
});

// Clear results
clearResultsBtn.addEventListener('click', () => {
  results = [];
  renderResults();
  updateStats();
  renderVendorAnalytics();
});

// Upload area click
uploadArea.addEventListener('click', () => fileInput.click());

// Drag and drop
uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('dragover');
});

    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      const droppedFiles = Array.from(e.dataTransfer.files);
      addFiles(droppedFiles);
      // Auto-upload after a brief delay
      setTimeout(() => {
        if (files.length > 0) {
          startAutoUpload();
        }
      }, 500);
    });

    // File input change - auto upload
    fileInput.addEventListener('change', (e) => {
      const selectedFiles = Array.from(e.target.files);
      addFiles(selectedFiles);
      // Auto-upload after a brief delay to show files in list
      setTimeout(() => {
        if (files.length > 0) {
          startAutoUpload();
        }
      }, 500);
    });

// Add files
function addFiles(newFiles) {
  const validFiles = newFiles.filter(file => {
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    const validExts = ['.pdf', '.png', '.jpg', '.jpeg', '.tiff', '.tif', '.gif', '.bmp', '.webp'];
    return validExts.includes(ext);
  });

  if (validFiles.length !== newFiles.length) {
    showNotification('Some files were skipped. Only PDF and image files are supported.', 'error');
  }

  files.push(...validFiles);
  renderFileList();
  updateStats();
}

    // Start auto-upload process
    async function startAutoUpload() {
      const filesToUpload = files.filter(f => !processingFiles.has(f.name) && !results.some(r => r.fileName === f.name));
      
      if (filesToUpload.length === 0) return;
      
      // Upload files in parallel (batch of 3 at a time to avoid overwhelming)
      const batchSize = 3;
      for (let i = 0; i < filesToUpload.length; i += batchSize) {
        const batch = filesToUpload.slice(i, i + batchSize);
        await Promise.all(batch.map(file => uploadFile(file)));
      }
    }

    // Upload file (silent error handling)
    async function uploadFile(file) {
      processingFiles.add(file.name);
      file.uploadProgress = 0;
      renderFileList();

      try {
        // Request presigned URL
        const res = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name, fileType: file.type })
        });

        if (!res.ok) {
          throw new Error(`Upload failed`);
        }

        const data = await res.json();
        
        if (!data.uploadUrl) {
          throw new Error('Upload failed');
        }

        // Upload to S3 with progress tracking
        file.uploadProgress = 50;
        renderFileList();
        
        const uploadRes = await fetch(data.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file
        });

        if (!uploadRes.ok) {
          throw new Error('Upload failed');
        }

        file.uploadProgress = 100;
        processingFiles.delete(file.name);
        renderFileList();

        // Add success result silently
        addResult({
          fileName: file.name,
          status: 'success',
          text: 'Text extraction is being processed. Results will appear here once the Lambda function completes processing.',
          note: 'Note: Full OCR results will be available after Lambda processing completes.'
        });

      } catch (error) {
        // Silent error handling - just mark as error
        processingFiles.delete(file.name);
        file.uploadProgress = 0;
        renderFileList();
        
        addResult({
          fileName: file.name,
          status: 'error',
          text: 'Upload failed. Please try again.'
        });
      }
    }

// Add result
function addResult(result) {
  results.push(result);
  renderResults();
  updateStats();
  updateVisualization();
  renderVendorAnalytics();
}

// Update visualization chart
function updateVisualization() {
  // Filter results with amounts
  const resultsWithAmounts = results.filter(r => r.totalAmount !== null && r.totalAmount !== undefined);
  
  if (resultsWithAmounts.length === 0) {
    document.getElementById('totalAmountSum').textContent = '$0.00';
    if (amountChart) {
      amountChart.destroy();
      amountChart = null;
    }
    return;
  }
  
  // Calculate total
  const total = resultsWithAmounts.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
  const currency = resultsWithAmounts[0]?.currency || '$';
  document.getElementById('totalAmountSum').textContent = `${currency}${total.toFixed(2)}`;
  
  // Prepare chart data
  const labels = resultsWithAmounts.map(r => {
    const name = r.fileName || 'Unknown';
    return name.length > 20 ? name.substring(0, 20) + '...' : name;
  });
  const amounts = resultsWithAmounts.map(r => r.totalAmount || 0);
  
  // Get or create canvas
  const ctx = document.getElementById('amountChart');
  if (!ctx) return;
  
  // Destroy existing chart if it exists
  if (amountChart) {
    amountChart.destroy();
  }
  
  // Create new chart
  amountChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Total Amount',
        data: amounts,
        backgroundColor: 'rgba(102, 126, 234, 0.8)',
        borderColor: 'rgba(102, 126, 234, 1)',
        borderWidth: 2,
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const currency = resultsWithAmounts[context.dataIndex]?.currency || '$';
              return `${currency}${context.parsed.y.toFixed(2)}`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return '$' + value.toFixed(2);
            }
          }
        },
        x: {
          ticks: {
            maxRotation: 45,
            minRotation: 45
          }
        }
      }
    }
  });
}

// Render results
function renderResults() {
  if (results.length === 0) {
    resultsContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📄</div>
        <p>No results yet. Upload files to see extracted text here.</p>
        <p style="margin-top: 10px; font-size: 0.9rem;">Or click "Fetch from DynamoDB" to load previous results.</p>
      </div>
    `;
    return;
  }

  resultsContainer.innerHTML = results.map((result, index) => {
    const processedDate = result.processedAt ? new Date(result.processedAt).toLocaleString() : '';
    // Show full text from DynamoDB (it should have the complete extracted text)
    const displayText = result.text || 'No text extracted';
    
    return `
    <div class="result-item">
      <div class="result-header">
        <div class="result-title">
          ${getFileIcon(result.fileName)} ${result.fileName}
        </div>
        <span class="status-badge status-${result.status}">
          ${result.status === 'success' ? '✓ Success' : '✗ Error'}
        </span>
      </div>
      ${processedDate ? `<p style="margin-bottom: 10px; color: #666; font-size: 0.85rem;">Processed: ${processedDate}</p>` : ''}
      ${result.totalAmount !== null && result.totalAmount !== undefined ? `<p style="margin-bottom: 10px; color: #667eea; font-size: 1rem; font-weight: 600;">Total Amount: ${result.currency || '$'}${result.totalAmount.toFixed(2)}</p>` : ''}
      ${result.textLength ? `<p style="margin-bottom: 10px; color: #666; font-size: 0.85rem;">Text Length: ${result.textLength.toLocaleString()} characters</p>` : ''}
      <div class="result-content">${displayText}</div>
      ${result.note ? `<p style="margin-top: 10px; color: #666; font-size: 0.9rem;">${result.note}</p>` : ''}
    </div>
  `;
  }).join('');
}

// Fetch results from DynamoDB via API Gateway
async function fetchResultsFromDynamoDB() {
  try {
    fetchResultsBtn.disabled = true;
    fetchResultsBtn.innerHTML = '<span class="spinner"></span> Fetching...';
    
    const response = await fetch(resultsApiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }
    
    const items = await response.json();
    
    // Clear existing results
    results = [];
    
    // Process each item from DynamoDB
    if (Array.isArray(items) && items.length > 0) {
      items.forEach(item => {
        console.log('Processing item:', item); // Debug log
        
        // Extract filename (handle both lowercase and camelCase)
        let fileName = item.filename || item.fileName || item.fileId || item.s3Key || 'Unknown file';
        
        // Extract mime type
        let mimeType = item.mime_type || item.mimeType || '';
        
        // Parse raw_json to get the extracted text
        let extractedText = 'No text extracted';
        let textLength = 0;
        
        if (item.raw_json) {
          try {
            // raw_json is a JSON string, parse it
            const rawJsonStr = typeof item.raw_json === 'string' ? item.raw_json : JSON.stringify(item.raw_json);
            const rawJson = JSON.parse(rawJsonStr);
            
            // Extract text from the parsed JSON
            extractedText = rawJson.text || rawJson.Text || 'No text extracted';
            textLength = extractedText.length;
          } catch (e) {
            console.error('Error parsing raw_json:', e, item.raw_json);
            extractedText = 'Error parsing extracted text: ' + e.message;
            textLength = 0;
          }
        } else {
          // Fallback to direct text fields
          extractedText = item.extractedText || item.text || 'No text extracted';
          textLength = item.textLength || item.text_length || extractedText.length;
        }
        
        // Get processed date
        const processedAt = item.processedAt || item.timestamp || item.createdAt || null;
        const status = item.status || 'success';
        
        // Extract supplier and invoice data from structured_fields
        let totalAmount = null;
        let currency = '$';
        let supplierName = null;
        let invoiceDate = null;
        let invoiceId = null;
        let supplierTaxId = null;
        
        if (item.structured_fields) {
          try {
            const structuredFields = typeof item.structured_fields === 'string' 
              ? JSON.parse(item.structured_fields) 
              : item.structured_fields;
            
            // Helper function to extract value from DynamoDB format
            const getValue = (field) => {
              if (!field) return null;
              if (typeof field === 'object') {
                if (field.N) return parseFloat(field.N);
                if (field.S) return field.S;
                if (field.M) return field.M;
              }
              return field;
            };
            
            // Extract all fields
            totalAmount = getValue(structuredFields.total_amount);
            if (typeof totalAmount === 'string') totalAmount = parseFloat(totalAmount);
            
            currency = getValue(structuredFields.currency) || '$';
            supplierName = getValue(structuredFields.supplier_name);
            invoiceDate = getValue(structuredFields.invoice_date);
            invoiceId = getValue(structuredFields.invoice_id);
            supplierTaxId = getValue(structuredFields.supplier_tax_id);
            
          } catch (e) {
            console.error('Error parsing structured_fields:', e);
          }
        }
        
        addResult({
          fileName: fileName,
          status: status,
          text: extractedText,
          processedAt: processedAt,
          textLength: textLength,
          mimeType: mimeType,
          fileId: item.fileId || item.file_id,
          totalAmount: totalAmount,
          currency: currency,
          supplierName: supplierName,
          invoiceDate: invoiceDate,
          invoiceId: invoiceId,
          supplierTaxId: supplierTaxId
        });
      });
      
      showNotification(`✓ Fetched ${items.length} result(s) from DynamoDB`, 'success');
    } else {
      showNotification('No results found in DynamoDB', 'error');
    }
  } catch (error) {
    console.error('Error fetching results:', error);
    showNotification(`✗ Error fetching results: ${error.message}`, 'error');
  } finally {
    fetchResultsBtn.disabled = false;
    fetchResultsBtn.innerHTML = '<span>📊 Load Analytics Data</span>';
  }
}

// Fetch results button click
fetchResultsBtn.addEventListener('click', () => {
  fetchResultsFromDynamoDB();
});

    // Remove upload button - auto-upload is now enabled

// ==================== VENDOR/SUPPLIER ANALYTICS ====================

// Calculate vendor spend analytics
function calculateVendorAnalytics() {
  const invoices = results.filter(r => r.totalAmount && r.supplierName);
  
  if (invoices.length === 0) {
    return null;
  }
  
  // Group by supplier
  const supplierData = {};
  
  invoices.forEach(invoice => {
    const supplier = invoice.supplierName || 'Unknown Supplier';
    if (!supplierData[supplier]) {
      supplierData[supplier] = {
        name: supplier,
        totalSpend: 0,
        invoiceCount: 0,
        invoices: [],
        taxId: invoice.supplierTaxId || null
      };
    }
    
    supplierData[supplier].totalSpend += invoice.totalAmount || 0;
    supplierData[supplier].invoiceCount += 1;
    supplierData[supplier].invoices.push({
      amount: invoice.totalAmount,
      date: invoice.invoiceDate || invoice.processedAt,
      invoiceId: invoice.invoiceId,
      fileName: invoice.fileName
    });
  });
  
  // Convert to array and sort by total spend
  const suppliers = Object.values(supplierData);
  suppliers.sort((a, b) => b.totalSpend - a.totalSpend);
  
  // Calculate analytics
  const analytics = {
    topSuppliers: suppliers.slice(0, 10), // Top 10
    costTrends: calculateCostTrends(suppliers),
    priceIncreases: detectPriceIncreases(suppliers),
    abnormalAmounts: detectAbnormalAmounts(suppliers),
    latePayments: detectLatePayments(invoices)
  };
  
  return analytics;
}

// Calculate cost trends (rising costs over time)
function calculateCostTrends(suppliers) {
  const trends = [];
  
  suppliers.forEach(supplier => {
    if (supplier.invoices.length < 2) return;
    
    // Sort invoices by date
    const sortedInvoices = supplier.invoices
      .filter(inv => inv.date)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    
    if (sortedInvoices.length < 2) return;
    
    // Calculate average amount for first half vs second half
    const midPoint = Math.floor(sortedInvoices.length / 2);
    const firstHalf = sortedInvoices.slice(0, midPoint);
    const secondHalf = sortedInvoices.slice(midPoint);
    
    const firstAvg = firstHalf.reduce((sum, inv) => sum + inv.amount, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, inv) => sum + inv.amount, 0) / secondHalf.length;
    
    const changePercent = ((secondAvg - firstAvg) / firstAvg) * 100;
    
    if (changePercent > 5) { // More than 5% increase
      trends.push({
        supplier: supplier.name,
        changePercent: changePercent.toFixed(2),
        firstAvg: firstAvg,
        secondAvg: secondAvg,
        trend: 'rising'
      });
    } else if (changePercent < -5) { // More than 5% decrease
      trends.push({
        supplier: supplier.name,
        changePercent: Math.abs(changePercent).toFixed(2),
        firstAvg: firstAvg,
        secondAvg: secondAvg,
        trend: 'falling'
      });
    }
  });
  
  return trends.sort((a, b) => parseFloat(b.changePercent) - parseFloat(a.changePercent));
}

// Detect price increases compared to previous invoices
function detectPriceIncreases(suppliers) {
  const increases = [];
  
  suppliers.forEach(supplier => {
    if (supplier.invoices.length < 2) return;
    
    const sortedInvoices = supplier.invoices
      .filter(inv => inv.date)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    
    for (let i = 1; i < sortedInvoices.length; i++) {
      const prev = sortedInvoices[i - 1];
      const curr = sortedInvoices[i];
      const increase = ((curr.amount - prev.amount) / prev.amount) * 100;
      
      if (increase > 10) { // More than 10% increase
        increases.push({
          supplier: supplier.name,
          previousAmount: prev.amount,
          currentAmount: curr.amount,
          increasePercent: increase.toFixed(2),
          previousDate: prev.date,
          currentDate: curr.date,
          invoiceId: curr.invoiceId
        });
      }
    }
  });
  
  return increases.sort((a, b) => parseFloat(b.increasePercent) - parseFloat(a.increasePercent));
}

// Detect abnormal invoice amounts (statistical outliers)
function detectAbnormalAmounts(suppliers) {
  const abnormal = [];
  
  suppliers.forEach(supplier => {
    if (supplier.invoices.length < 3) return; // Need at least 3 invoices for stats
    
    const amounts = supplier.invoices.map(inv => inv.amount);
    const mean = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
    const variance = amounts.reduce((sum, amt) => sum + Math.pow(amt - mean, 2), 0) / amounts.length;
    const stdDev = Math.sqrt(variance);
    
    // Flag invoices more than 2 standard deviations from mean
    supplier.invoices.forEach(invoice => {
      const zScore = Math.abs((invoice.amount - mean) / stdDev);
      if (zScore > 2) {
        abnormal.push({
          supplier: supplier.name,
          amount: invoice.amount,
          mean: mean,
          stdDev: stdDev,
          zScore: zScore.toFixed(2),
          invoiceId: invoice.invoiceId,
          fileName: invoice.fileName,
          date: invoice.date
        });
      }
    });
  });
  
  return abnormal.sort((a, b) => b.zScore - a.zScore);
}

// Detect late payments (invoices older than 30 days from processing)
function detectLatePayments(invoices) {
  const late = [];
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  invoices.forEach(invoice => {
    if (!invoice.invoiceDate && !invoice.processedAt) return;
    
    const invoiceDate = invoice.invoiceDate ? new Date(invoice.invoiceDate) : new Date(invoice.processedAt);
    const processedDate = invoice.processedAt ? new Date(invoice.processedAt) : new Date();
    
    // If invoice date is more than 30 days before processing, consider it late
    const daysDiff = (processedDate - invoiceDate) / (1000 * 60 * 60 * 24);
    
    if (daysDiff > 30) {
      late.push({
        supplier: invoice.supplierName || 'Unknown',
        invoiceId: invoice.invoiceId,
        amount: invoice.totalAmount,
        invoiceDate: invoiceDate.toISOString().split('T')[0],
        processedDate: processedDate.toISOString().split('T')[0],
        daysLate: Math.floor(daysDiff - 30),
        fileName: invoice.fileName
      });
    }
  });
  
  return late.sort((a, b) => b.daysLate - a.daysLate);
}

// Chart instances
let spendTrendChart = null;
let vendorSpendChart = null;
let invoiceCountChart = null;
let tableSortDirection = {};

// Render dashboard with KPIs, charts, and table
function renderVendorAnalytics() {
  const invoices = results.filter(r => r.totalAmount && r.supplierName);
  
  if (invoices.length === 0) {
    // Clear everything if no data
    document.getElementById('totalSpendMonth').textContent = '$0.00';
    document.getElementById('overdueAmount').textContent = '$0.00';
    document.getElementById('invoiceCount').textContent = '0';
    document.getElementById('avgDaysToPay').textContent = '0';
    
    if (spendTrendChart) { spendTrendChart.destroy(); spendTrendChart = null; }
    if (vendorSpendChart) { vendorSpendChart.destroy(); vendorSpendChart = null; }
    if (invoiceCountChart) { invoiceCountChart.destroy(); invoiceCountChart = null; }
    
    document.getElementById('invoicesTableBody').innerHTML = 
      '<tr><td colspan="6" class="empty-table">No invoices available. Load data to see invoices.</td></tr>';
    return;
  }
  
  const currency = invoices[0]?.currency || '$';
  
  // Calculate KPIs
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  
  const thisMonthInvoices = invoices.filter(inv => {
    const invDate = inv.invoiceDate ? new Date(inv.invoiceDate) : (inv.processedAt ? new Date(inv.processedAt) : null);
    return invDate && invDate >= startOfMonth;
  });
  
  const totalSpendMonth = thisMonthInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
  
  const latePayments = detectLatePayments(invoices);
  const overdueAmount = latePayments.reduce((sum, late) => sum + (late.amount || 0), 0);
  
  const invoiceCount = invoices.length;
  
  // Calculate average days to pay
  let totalDays = 0;
  let validInvoices = 0;
  invoices.forEach(inv => {
    if (inv.invoiceDate && inv.processedAt) {
      const invDate = new Date(inv.invoiceDate);
      const procDate = new Date(inv.processedAt);
      const days = (procDate - invDate) / (1000 * 60 * 60 * 24);
      if (days > 0) {
        totalDays += days;
        validInvoices++;
      }
    }
  });
  const avgDaysToPay = validInvoices > 0 ? Math.round(totalDays / validInvoices) : 0;
  
  // Update KPI cards
  document.getElementById('totalSpendMonth').textContent = `${currency}${totalSpendMonth.toFixed(2)}`;
  document.getElementById('overdueAmount').textContent = `${currency}${overdueAmount.toFixed(2)}`;
  document.getElementById('invoiceCount').textContent = invoiceCount;
  document.getElementById('avgDaysToPay').textContent = avgDaysToPay;
  
  // Render charts
  renderSpendTrendChart(invoices, currency);
  renderVendorSpendChart(invoices, currency);
  renderInvoiceCountChart(invoices);
  
  // Render table
  renderInvoicesTable(invoices, currency);
}

// Render spend trend line chart
function renderSpendTrendChart(invoices, currency) {
  // Group by month
  const monthlyData = {};
  invoices.forEach(inv => {
    const date = inv.invoiceDate ? new Date(inv.invoiceDate) : (inv.processedAt ? new Date(inv.processedAt) : new Date());
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = 0;
    }
    monthlyData[monthKey] += inv.totalAmount || 0;
  });
  
  const sortedMonths = Object.keys(monthlyData).sort();
  const labels = sortedMonths.map(m => {
    const [year, month] = m.split('-');
    return new Date(year, parseInt(month) - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  });
  const data = sortedMonths.map(m => monthlyData[m]);
  
  const ctx = document.getElementById('spendTrendChart');
  if (!ctx) return;
  
  if (spendTrendChart) spendTrendChart.destroy();
  
  spendTrendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Spend',
        data: data,
        borderColor: '#3498db',
        backgroundColor: 'rgba(52, 152, 219, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return currency + value.toFixed(0);
            }
          }
        }
      }
    }
  });
}

// Render vendor spend bar chart
function renderVendorSpendChart(invoices, currency) {
  const supplierData = {};
  invoices.forEach(inv => {
    const supplier = inv.supplierName || 'Unknown';
    if (!supplierData[supplier]) {
      supplierData[supplier] = 0;
    }
    supplierData[supplier] += inv.totalAmount || 0;
  });
  
  const sortedSuppliers = Object.entries(supplierData)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  const labels = sortedSuppliers.map(s => s[0].length > 20 ? s[0].substring(0, 20) + '...' : s[0]);
  const data = sortedSuppliers.map(s => s[1]);
  
  const ctx = document.getElementById('vendorSpendChart');
  if (!ctx) return;
  
  if (vendorSpendChart) vendorSpendChart.destroy();
  
  vendorSpendChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Spend',
        data: data,
        backgroundColor: '#667eea',
        borderColor: '#764ba2',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return currency + value.toFixed(0);
            }
          }
        },
        x: {
          ticks: {
            maxRotation: 45,
            minRotation: 45
          }
        }
      }
    }
  });
}

// Render invoice count over time chart
function renderInvoiceCountChart(invoices) {
  const monthlyCount = {};
  invoices.forEach(inv => {
    const date = inv.invoiceDate ? new Date(inv.invoiceDate) : (inv.processedAt ? new Date(inv.processedAt) : new Date());
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!monthlyCount[monthKey]) {
      monthlyCount[monthKey] = 0;
    }
    monthlyCount[monthKey]++;
  });
  
  const sortedMonths = Object.keys(monthlyCount).sort();
  const labels = sortedMonths.map(m => {
    const [year, month] = m.split('-');
    return new Date(year, parseInt(month) - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  });
  const data = sortedMonths.map(m => monthlyCount[m]);
  
  const ctx = document.getElementById('invoiceCountChart');
  if (!ctx) return;
  
  if (invoiceCountChart) invoiceCountChart.destroy();
  
  invoiceCountChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Invoice Count',
        data: data,
        borderColor: '#27ae60',
        backgroundColor: 'rgba(39, 174, 96, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1
          }
        }
      }
    }
  });
}

// Render invoices table
function renderInvoicesTable(invoices, currency) {
  const tbody = document.getElementById('invoicesTableBody');
  
  // Sort invoices by date (newest first)
  const sortedInvoices = [...invoices].sort((a, b) => {
    const dateA = a.invoiceDate ? new Date(a.invoiceDate) : (a.processedAt ? new Date(a.processedAt) : new Date(0));
    const dateB = b.invoiceDate ? new Date(b.invoiceDate) : (b.processedAt ? new Date(b.processedAt) : new Date(0));
    return dateB - dateA;
  });
  
  tbody.innerHTML = sortedInvoices.map(inv => {
    const invDate = inv.invoiceDate ? new Date(inv.invoiceDate) : (inv.processedAt ? new Date(inv.processedAt) : null);
    const procDate = inv.processedAt ? new Date(inv.processedAt) : null;
    
    const dateStr = invDate ? invDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A';
    
    let daysToPay = 'N/A';
    let status = 'pending';
    if (invDate && procDate) {
      const days = (procDate - invDate) / (1000 * 60 * 60 * 24);
      daysToPay = Math.round(days);
      if (days > 30) {
        status = 'overdue';
      } else if (days > 0) {
        status = 'paid';
      }
    }
    
    const statusBadge = status === 'paid' 
      ? '<span class="status-badge-table status-paid">Paid</span>'
      : status === 'overdue'
      ? '<span class="status-badge-table status-overdue">Overdue</span>'
      : '<span class="status-badge-table status-pending">Pending</span>';
    
    return `
      <tr>
        <td>${dateStr}</td>
        <td>${inv.supplierName || 'Unknown'}</td>
        <td>${inv.invoiceId || 'N/A'}</td>
        <td>${currency}${(inv.totalAmount || 0).toFixed(2)}</td>
        <td>${statusBadge}</td>
        <td>${daysToPay}</td>
      </tr>
    `;
  }).join('');
}

// Sort table function
window.sortTable = function(columnIndex) {
  const tbody = document.getElementById('invoicesTableBody');
  const rows = Array.from(tbody.querySelectorAll('tr'));
  
  if (rows.length === 0 || rows[0].querySelector('.empty-table')) return;
  
  const direction = tableSortDirection[columnIndex] === 'asc' ? 'desc' : 'asc';
  tableSortDirection[columnIndex] = direction;
  
  rows.sort((a, b) => {
    const aText = a.cells[columnIndex].textContent.trim();
    const bText = b.cells[columnIndex].textContent.trim();
    
    // Handle numbers
    if (columnIndex === 3 || columnIndex === 5) {
      const aNum = parseFloat(aText.replace(/[^0-9.-]/g, '')) || 0;
      const bNum = parseFloat(bText.replace(/[^0-9.-]/g, '')) || 0;
      return direction === 'asc' ? aNum - bNum : bNum - aNum;
    }
    
    // Handle dates
    if (columnIndex === 0) {
      const aDate = new Date(aText);
      const bDate = new Date(bText);
      return direction === 'asc' ? aDate - bDate : bDate - aDate;
    }
    
    // Handle text
    return direction === 'asc' 
      ? aText.localeCompare(bText)
      : bText.localeCompare(aText);
  });
  
  // Update sort icons
  document.querySelectorAll('th').forEach((th, idx) => {
    const icon = th.querySelector('.sort-icon');
    if (icon) {
      icon.textContent = idx === columnIndex ? (direction === 'asc' ? '↑' : '↓') : '↕';
    }
  });
  
  // Re-append sorted rows
  rows.forEach(row => tbody.appendChild(row));
};

// Initialize
updateStats();
