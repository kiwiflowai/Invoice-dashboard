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
    if (!notification) return;
    notification.textContent = msg;
    notification.className = `notification ${type} show`;
    setTimeout(() => notification.classList.remove("show"), 3000);
  }

  function showLogin() {
    document.body.classList.add("login-overlay-visible");
    if (loginOverlay) loginOverlay.style.display = "flex";
    if (logoutBtn) logoutBtn.style.display = "none";
    if (userInfo) userInfo.style.display = "none";
  }

  function hideLogin() {
    document.body.classList.remove("login-overlay-visible");
    if (loginOverlay) loginOverlay.style.display = "none";
    if (logoutBtn) logoutBtn.style.display = "flex";
    if (userInfo) {
      userInfo.style.display = "flex";
      if (currentUser && userName) userName.textContent = currentUser;
    }
  }

  function escapeHtml(text) {
    if (text == null) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // ---------------- INITIAL LOGIN CHECK ----------------
  showLogin(); // always show login overlay on page load

  // ---------------- LOGIN / SIGNUP ----------------
  let isLogin = true;
  if (loginBtn) loginBtn.addEventListener("click", async () => {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    if (!username || !password) {
      if (loginError) {
        loginError.classList.add("show");
        loginError.textContent = "Please enter username and password";
      }
      return;
    }

    const endpoint = isLogin ? LOGIN_API : SIGNUP_API;
    loginBtn.classList.add("is-loading");
    loginBtn.disabled = true;
    if (loginError) {
      loginError.classList.remove("show");
      loginError.textContent = "";
    }

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      let data;
      try {
        data = await res.json();
      } catch (parseErr) {
        if (loginError) {
          loginError.classList.add("show");
          loginError.textContent = res.status >= 500
            ? "Server is temporarily unavailable. Try again later."
            : "Invalid response from server.";
        }
        return;
      }

      if (res.ok) {
        currentUser = data.userId || username;
        localStorage.setItem("currentUser", currentUser);
        localStorage.setItem("token", data.token || "");

        hideLogin();
        if (loginError) loginError.classList.remove("show");
        showNotification(`Welcome ${currentUser}!`);

        usernameInput.value = "";
        passwordInput.value = "";

        resetState();
        await loadUserResults();
      } else {
        if (loginError) {
          loginError.classList.add("show");
          loginError.textContent = data.error || "Invalid credentials";
        }
      }
    } catch (err) {
      console.error(err);
      if (loginError) {
        loginError.classList.add("show");
        const isNetwork = err.name === "TypeError" && (err.message || "").includes("fetch");
        loginError.textContent = isNetwork
          ? "Network error. Check your connection or try again later."
          : "Something went wrong. Please try again.";
      }
      showNotification("Error", "error");
    } finally {
      loginBtn.classList.remove("is-loading");
      loginBtn.disabled = false;
    }
  });

  // Toggle login/signup
  function switchAuthMode() {
    isLogin = !isLogin;
    if (loginBtn) loginBtn.textContent = isLogin ? "Sign In" : "Sign Up";
    if (loginTitle) loginTitle.textContent = isLogin ? "Welcome Back" : "Create Account";
    if (toggleAuth) {
      toggleAuth.innerHTML = isLogin
        ? `Don't have an account? <span>Sign Up</span>`
        : `Already have an account? <span>Sign In</span>`;
    }
    if (loginError) {
      loginError.classList.remove("show");
      loginError.textContent = "";
    }
    usernameInput.value = "";
    passwordInput.value = "";
  }
  if (toggleAuth) {
    toggleAuth.addEventListener("click", switchAuthMode);
    toggleAuth.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        switchAuthMode();
      }
    });
  }

  // ---------------- LOGOUT ----------------
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("currentUser");
      localStorage.removeItem("token");
      currentUser = null;
      showLogin();
      resetState();
      showNotification("Logged out successfully");
    });
  }

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
    if (!fileList) return;
    if (files.length === 0) {
      fileList.innerHTML = "";
      return;
    }
    fileList.innerHTML = files.map((f) => {
      const isUploading = uploading.has(f.name);
      const fileSize = f.size ? formatFileSize(f.size) : "";
      const statusClass = isUploading ? "status-uploading" : "status-pending";
      const statusText = isUploading ? "Uploading..." : "Pending";
      const safeName = escapeHtml(f.name);
      return `<div class="file-item">
        <div class="file-info">
          <div class="file-icon">${getFileIcon(f.name)}</div>
          <div class="file-details">
            <div class="file-name">${safeName}</div>
            ${fileSize ? `<div class="file-size">${escapeHtml(fileSize)}</div>` : ""}
          </div>
        </div>
        <div class="file-status">
          <span class="status-badge ${statusClass}">${statusText}</span>
        </div>
      </div>`;
    }).join("");
  }

  function renderResults() {
    if (!resultsContainer) return;
    if (!results.length) {
      resultsContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📄</div>
          <h3>No results yet</h3>
          <p>Upload files to see extracted text here, or load previous results from your account.</p>
        </div>`;
      return;
    }
    resultsContainer.innerHTML = results.map((r) => {
      const safeFileName = escapeHtml(r.fileName);
      const safeSummary = escapeHtml(r.summary || "No summary available");
      return `<div class="result-item">
        <div class="result-header">
          <div class="result-title">
            <span>${getFileIcon(r.fileName)}</span>
            <span>${safeFileName}</span>
          </div>
        </div>
        <div class="result-content">${safeSummary}</div>
      </div>`;
    }).join("");
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

  if (fetchResultsBtn) fetchResultsBtn.addEventListener("click", loadUserResults);
  if (clearResultsBtn) clearResultsBtn.addEventListener("click", () => { results = []; renderResults(); });
  if (clearBtn) clearBtn.addEventListener("click", () => { files = []; uploading.clear(); renderFiles(); });

  if (uploadArea && fileInput) {
    uploadArea.onclick = () => fileInput.click();
    uploadArea.ondragover = (e) => { e.preventDefault(); uploadArea.classList.add("dragover"); };
    uploadArea.ondragleave = () => uploadArea.classList.remove("dragover");
    uploadArea.ondrop = (e) => {
      e.preventDefault();
      uploadArea.classList.remove("dragover");
      addFiles(Array.from(e.dataTransfer.files || []));
    };
    fileInput.onchange = (e) => addFiles(Array.from(e.target.files || []));
  }

  renderFiles();
  renderResults();
});
