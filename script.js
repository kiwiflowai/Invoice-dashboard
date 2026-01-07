const resultsApiUrl =
  "https://a8uoo3tjc6.execute-api.ap-southeast-2.amazonaws.com/prod/results";

let results = [];
let pollingInterval = null;

// DOM Elements
const resultsContainer = document.getElementById("resultsContainer");
const fetchResultsBtn = document.getElementById("fetchResultsBtn");
const notification = document.getElementById("notification");

// --------------------
// Utilities
// --------------------
function showNotification(message, type = "success") {
  notification.textContent = message;
  notification.className = `notification ${type} show`;
  setTimeout(() => notification.classList.remove("show"), 3000);
}

// --------------------
// Render Results
// --------------------
function renderResults() {
  if (!results.length) {
    resultsContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⏳</div>
        <p>Still fetching OCR results...</p>
      </div>
    `;
    return;
  }

  resultsContainer.innerHTML = results
    .map(
      (r) => `
    <div class="result-item">
      <div class="result-header">
        <div class="result-title">📄 ${r.fileName}</div>
        <span class="status-badge">Ready</span>
      </div>
      <p class="timestamp">
        Processed: ${r.timestamp ? new Date(r.timestamp).toLocaleString() : "N/A"}
      </p>
      <div class="result-content">
        ${r.summary}
      </div>
    </div>
  `
    )
    .join("");
}

// --------------------
// Poll DynamoDB
// --------------------
async function fetchResultsFromDynamoDB() {
  if (pollingInterval) return;

  fetchResultsBtn.disabled = true;
  fetchResultsBtn.innerHTML = '<span class="spinner"></span> Still fetching...';

  results = [];
  renderResults();
  showNotification("Polling DynamoDB for OCR results...");

  pollingInterval = setInterval(async () => {
    try {
      const response = await fetch(resultsApiUrl);
      if (!response.ok) throw new Error("API error");

      const data = await response.json();
      console.log("Polling:", data);

      if (!data.items || data.items.length === 0) {
        return; // keep waiting
      }

      // Data found → stop polling
      clearInterval(pollingInterval);
      pollingInterval = null;

      results = data.items.map((item) => ({
        fileName: item.filename,
        summary: item.summary || "No summary available",
        timestamp: item.timestamp,
      }));

      renderResults();
      showNotification(`Loaded ${results.length} summaries ✔️`);

      fetchResultsBtn.disabled = false;
      fetchResultsBtn.innerHTML = "📊 Load Analytics";
    } catch (err) {
      console.error("Polling error:", err);
    }
  }, 3000);
}

// --------------------
// Events
// --------------------
if (fetchResultsBtn) {
  fetchResultsBtn.addEventListener("click", fetchResultsFromDynamoDB);
}

// Init
renderResults();
