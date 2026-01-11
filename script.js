document.addEventListener('DOMContentLoaded', () => {
  const apiUrl = "https://6kl77b9h06.execute-api.ap-southeast-2.amazonaws.com/prod/upload";
  const resultsApiUrl = "https://a8uoo3tjc6.execute-api.ap-southeast-2.amazonaws.com/prod/results";

  let files = [];
  let results = [];
  let uploading = new Set();

  // ---------------- LOGIN SYSTEM ----------------
  const loginOverlay = document.getElementById("loginOverlay");
  const usernameInput = document.getElementById("usernameInput");
  const passwordInput = document.getElementById("passwordInput");
  const loginBtn = document.getElementById("loginBtn");
  const loginError = document.getElementById("loginError");
  const logoutBtn = document.getElementById("logoutBtn");

  const users = { "alice": "1234", "bob": "abcd" }; // prototype only

  let currentUser = null; // always start with no user logged in
  loginOverlay.style.display = "flex";
  logoutBtn.style.display = "none";


  // ---------------- Utils ----------------
  function requireLogin() {
    if (!currentUser) {
      showNotification("Please login first", "error");
      loginOverlay.style.display = "flex";
      return false;
    }
    return true;
  }

  function showNotification(msg, type = "success") {
    notification.textContent = msg;
    notification.className = `notification ${type} show`;
    setTimeout(() => notification.classList.remove("show"), 3000);
  }

  function getFileIcon(name) {
    const ext = name.split(".").pop().toLowerCase();
    if (["png","jpg","jpeg","gif","bmp","webp","tif","tiff"].includes(ext)) return "🖼️";
    if (ext === "pdf") return "📄";
    return "📎";
  }

  // ---------------- State Helpers ----------------
  function resetState() {
    files = [];
    results = [];
    uploading.clear();
    renderFiles();
    renderResults();
  }

  async function loadUserResults() {
    if (!currentUser) return;

    try {
      const res = await fetch(`${resultsApiUrl}?userId=${encodeURIComponent(currentUser)}`);
      const data = await res.json();
      const items = data.items || [];

      results = items.map(item => ({
        fileName: (item.filename || "Unknown").split("/").pop(),
        summary: item.summary || "No summary"
      }));

      renderResults();
      showNotification("User results loaded");
    } catch (err) {
      console.error(err);
      showNotification("Failed to load user results", "error");
    }
  }

  // ---------------- LOGIN / LOGOUT ----------------
  loginBtn.addEventListener("click", async () => {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (users[username] && users[username] === password) {
      localStorage.setItem("currentUser", username);
      currentUser = username;
      loginOverlay.style.display = "none";
      logoutBtn.style.display = "block";
      loginError.style.display = "none";

      resetState();            // Clear old files/results
      await loadUserResults(); // Load current user's previous results

      showNotification(`Welcome ${username}!`);
    } else {
      loginError.style.display = "block";
    }
  });

  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("currentUser");
    currentUser = null;
    loginOverlay.style.display = "flex";
    logoutBtn.style.display = "none";

    resetState(); // Clear everything
    showNotification("Logged out");
  });

  // ---------------- DOM Elements ----------------
  const uploadArea = document.getElementById("uploadArea");
  const fileInput = document.getElementById("fileInput");
  const fileList = document.getElementById("fileList");
  const clearBtn = document.getElementById("clearBtn");
  const resultsContainer = document.getElementById("resultsContainer");
  const fetchResultsBtn = document.getElementById("fetchResultsBtn");
  const clearResultsBtn = document.getElementById("clearResultsBtn");
  const notification = document.getElementById("notification");

  // ---------------- Render Files ----------------
  function renderFiles() {
    if (!files.length) {
      fileList.innerHTML = "";
      return;
    }

    fileList.innerHTML = files.map((f, i) => {
      const isUploading = uploading.has(f.name);
      return `
        <div class="file-item">
          <div>${getFileIcon(f.name)} <strong>${f.name}</strong></div>
          <div>${isUploading ? "Uploading..." : ""}
            <button class="btn btn-remove" data-index="${i}">Remove</button>
          </div>
        </div>
      `;
    }).join("");

    document.querySelectorAll(".btn-remove").forEach(btn => {
      btn.onclick = e => {
        const index = Number(e.target.dataset.index);
        files.splice(index, 1);
        renderFiles();
      };
    });
  }

  // ---------------- Render Results ----------------
  function renderResults() {
    if (!results.length) {
      resultsContainer.innerHTML = `
        <div class="empty-state">📄 No results yet.</div>
      `;
      return;
    }

    resultsContainer.innerHTML = results.map(r => `
      <div class="result-item">
        <h4>${getFileIcon(r.fileName)} ${r.fileName}<span class="result-badge">OCR Result</span></h4>
        <div class="result-summary">${r.summary || "No summary available"}</div>
      </div>
    `).join("");
  }

  // ---------------- File Handling ----------------
  function addFiles(newFiles) {
    if (!newFiles.length) return;
    files.push(...newFiles);
    renderFiles();
    autoUpload();
  }

  async function autoUpload() {
    const pending = files.filter(f => 
      !uploading.has(f.name) &&
      !results.some(r => r.fileName === f.name)
    );

    for (const file of pending) uploadFile(file);
  }

  async function uploadFile(file) {
    if (!requireLogin()) return;
    uploading.add(file.name);
    renderFiles();

    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type,
          userId: currentUser
        })
      });
      const data = await res.json();
      if (!data.uploadUrl) throw new Error("No upload URL returned");

      await fetch(data.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });

      results.push({
        fileName: file.name,
        summary: "Uploaded successfully. OCR processing in progress..."
      });

      showNotification(`Uploaded ${file.name}`);

    } catch (err) {
      console.error(err);
      showNotification(`Upload failed: ${file.name}`, "error");
    }

    uploading.delete(file.name);
    renderFiles();
    renderResults();
  }

  // ---------------- Fetch Results ----------------
  fetchResultsBtn.addEventListener("click", loadUserResults);

  clearResultsBtn.addEventListener("click", () => {
    results = [];
    renderResults();
  });

  clearBtn.addEventListener("click", () => {
    files = [];
    uploading.clear();
    renderFiles();
  });

  // ---------------- Upload UI ----------------
  uploadArea.onclick = () => fileInput.click();
  uploadArea.ondragover = e => { e.preventDefault(); uploadArea.classList.add("dragover"); };
  uploadArea.ondragleave = () => { uploadArea.classList.remove("dragover"); };
  uploadArea.ondrop = e => { e.preventDefault(); uploadArea.classList.remove("dragover"); addFiles(Array.from(e.dataTransfer.files)); };
  fileInput.onchange = e => addFiles(Array.from(e.target.files));

  // Init
  renderFiles();
  renderResults();
});
