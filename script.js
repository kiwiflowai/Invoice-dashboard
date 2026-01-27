document.addEventListener('DOMContentLoaded', () => {
  // ---------------- FORCE LOGOUT ON REFRESH ----------------
  localStorage.removeItem("currentUser");
  localStorage.removeItem("token");

  const apiUrl = "https://6kl77b9h06.execute-api.ap-southeast-2.amazonaws.com/prod/upload";
  const resultsApiUrl = "https://a8uoo3tjc6.execute-api.ap-southeast-2.amazonaws.com/prod/results";
  const LOGIN_API = "https://9gyrocprv5.execute-api.ap-southeast-2.amazonaws.com/login";
  const SIGNUP_API = "https://gsq9rae8vh.execute-api.ap-southeast-2.amazonaws.com/signup";

  let files = [];
  let results = [];
  let uploading = new Set();

  // ---------------- LOGIN ----------------
  const loginOverlay = document.getElementById("loginOverlay");
  const usernameInput = document.getElementById("usernameInput");
  const passwordInput = document.getElementById("passwordInput");
  const loginBtn = document.getElementById("loginBtn");
  const loginError = document.getElementById("loginError");
  const loginTitle = document.getElementById("loginTitle");
  const toggleAuth = document.getElementById("toggleAuth");
  const logoutBtn = document.getElementById("logoutBtn");
  const userInfo = document.getElementById("userInfo");
  const userName = userInfo ? userInfo.querySelector(".user-name") : null;
  const notification = document.getElementById("notification");

  let currentUser = null; // start fresh every reload

  // ---------------- UTILITY FUNCTIONS ----------------
  function showNotification(msg, type = "success") {
    notification.textContent = msg;
    notification.className = `notification ${type} show`;
    setTimeout(() => notification.classList.remove("show"), 3000);
  }

  function showLogin() {
    loginOverlay.style.display = "flex";
    logoutBtn.style.display = "none";
    if (userInfo) {
      userInfo.style.display = "none";
    }
  }

  function hideLogin() {
    loginOverlay.style.display = "none";
    logoutBtn.style.display = "flex";
    if (userInfo) {
      userInfo.style.display = "flex";
      if (currentUser && userName) {
        userName.textContent = currentUser;
      }
    }
  }

  // ---------------- INITIAL LOGIN CHECK ----------------
  showLogin(); // always show login overlay on page load

  // ---------------- LOGIN / SIGNUP ----------------
  let isLogin = true;
  loginBtn.addEventListener("click", async () => {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    if (!username || !password) {
      loginError.classList.add("show");
      loginError.textContent = "Please enter username and password";
      return;
    }

    const endpoint = isLogin ? LOGIN_API : SIGNUP_API;

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (res.ok) {
        currentUser = data.userId || username;
        localStorage.setItem("currentUser", currentUser);
        localStorage.setItem("token", data.token || "");

        hideLogin(); // hide login overlay after login
        loginError.classList.remove("show");
        showNotification(`Welcome ${currentUser}!`);

        usernameInput.value = "";
        passwordInput.value = "";

        resetState();
        await loadUserResults();
      } else {
        loginError.classList.add("show");
        loginError.textContent = data.error || "Invalid credentials";
      }
    } catch (err) {
      console.error(err);
      loginError.classList.add("show");
      loginError.textContent = "Server error. Please try again.";
      showNotification("Server error", "error");
    }
  });

  // Toggle login/signup
  toggleAuth.addEventListener("click", () => {
    isLogin = !isLogin;
    loginBtn.textContent = isLogin ? "Sign In" : "Sign Up";
    loginTitle.textContent = isLogin ? "Welcome Back" : "Create Account";
    toggleAuth.innerHTML = isLogin
      ? `Don't have an account? <span>Sign Up</span>`
      : `Already have an account? <span>Sign In</span>`;
    loginError.classList.remove("show");
    usernameInput.value = "";
    passwordInput.value = "";
  });

  // ---------------- LOGOUT ----------------
  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("currentUser");
    localStorage.removeItem("token");
    currentUser = null;
    showLogin();
    resetState();
    showNotification("Logged out successfully");
  });

  // ---------------- OCR FILE UPLOAD ----------------
  const uploadArea = document.getElementById("uploadArea");
  const fileInput = document.getElementById("fileInput");
  const fileList = document.getElementById("fileList");
  const clearBtn = document.getElementById("clearBtn");
  const resultsContainer = document.getElementById("resultsContainer");
  const fetchResultsBtn = document.getElementById("fetchResultsBtn");
  const clearResultsBtn = document.getElementById("clearResultsBtn");

  function requireLogin() {
    if (!currentUser) {
      showNotification("Please login first", "error");
      showLogin();
      return false;
    }
    return true;
  }

  function getFileIcon(name) {
    const ext = name.split(".").pop().toLowerCase();
    if (["png","jpg","jpeg","gif","bmp","webp","tif","tiff"].includes(ext)) return "🖼️";
    if (ext === "pdf") return "📄";
    return "📎";
  }

  function resetState() {
    files = [];
    results = [];
    uploading.clear();
    renderFiles();
    renderResults();
  }

  function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  function renderFiles() {
    if (files.length === 0) {
      fileList.innerHTML = "";
      return;
    }
    
    fileList.innerHTML = files.map((f) => {
      const isUploading = uploading.has(f.name);
      const fileSize = f.size ? formatFileSize(f.size) : "";
      const statusClass = isUploading ? "status-uploading" : "status-pending";
      const statusText = isUploading ? "Uploading..." : "Pending";
      
      return `<div class="file-item">
        <div class="file-info">
          <div class="file-icon">${getFileIcon(f.name)}</div>
          <div class="file-details">
            <div class="file-name">${f.name}</div>
            ${fileSize ? `<div class="file-size">${fileSize}</div>` : ""}
          </div>
        </div>
        <div class="file-status">
          <span class="status-badge ${statusClass}">${statusText}</span>
        </div>
      </div>`;
    }).join("");
  }

  function renderResults() {
    if (!results.length) {
      resultsContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📄</div>
          <h3>No results yet</h3>
          <p>Upload files to see extracted text here, or load previous results from your account.</p>
        </div>`;
      return;
    }
    resultsContainer.innerHTML = results.map(r => `
      <div class="result-item">
        <div class="result-header">
          <div class="result-title">
            <span>${getFileIcon(r.fileName)}</span>
            <span>${r.fileName}</span>
          </div>
        </div>
        <div class="result-content">${r.summary || "No summary available"}</div>
      </div>
    `).join("");
  }

  function addFiles(newFiles) {
    if (!newFiles.length) return;
    files.push(...newFiles);
    renderFiles();
    autoUpload();
  }

  async function autoUpload() {
    const pending = files.filter(f => !uploading.has(f.name) && !results.some(r => r.fileName===f.name));
    for (const f of pending) uploadFile(f);
  }

  async function uploadFile(file) {
    if (!requireLogin()) return;
    uploading.add(file.name);
    renderFiles();

    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName:file.name, fileType:file.type, userId:currentUser })
      });
      const data = await res.json();
      if (!data.uploadUrl) throw new Error("No upload URL");

      await fetch(data.uploadUrl, { method:"PUT", headers:{"Content-Type":file.type}, body:file });

      results.push({ fileName:file.name, summary:"Uploaded successfully. OCR processing in progress..." });
      showNotification(`Uploaded ${file.name}`);
    } catch(err) {
      console.error(err);
      showNotification(`Upload failed: ${file.name}`, "error");
    }

    uploading.delete(file.name);
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
        fileName:(item.filename||"Unknown").split("/").pop(),
        summary:item.summary||"No summary"
      }));
      renderResults();
      showNotification("User results loaded");
    } catch(err) {
      console.error(err);
      showNotification("Failed to load user results","error");
    }
  }

  fetchResultsBtn.addEventListener("click", loadUserResults);
  clearResultsBtn.addEventListener("click", () => { results=[]; renderResults(); });
  clearBtn.addEventListener("click", () => { files=[]; uploading.clear(); renderFiles(); });

  uploadArea.onclick = () => fileInput.click();
  uploadArea.ondragover = e => { e.preventDefault(); uploadArea.classList.add("dragover"); };
  uploadArea.ondragleave = () => { uploadArea.classList.remove("dragover"); };
  uploadArea.ondrop = e => { e.preventDefault(); uploadArea.classList.remove("dragover"); addFiles(Array.from(e.dataTransfer.files)); };
  fileInput.onchange = e => addFiles(Array.from(e.target.files));

  renderFiles();
  renderResults();
});
