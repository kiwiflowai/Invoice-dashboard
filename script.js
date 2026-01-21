document.addEventListener('DOMContentLoaded', () => {
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
  const logoutBtn = document.getElementById("logoutBtn");
  const notification = document.getElementById("notification");

  let currentUser = localStorage.getItem("currentUser") || null;

  // Show/hide overlay
  loginOverlay.style.display = currentUser ? "none" : "flex";
  logoutBtn.style.display = currentUser ? "block" : "none";

  function showNotification(msg, type = "success") {
    notification.textContent = msg;
    notification.className = `notification ${type} show`;
    setTimeout(() => notification.classList.remove("show"), 3000);
  }

  

  // ---------------- LOGIN / SIGNUP ----------------
  let isLogin = true; // true = login, false = signup
  loginBtn.addEventListener("click", async () => {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    if (!username || !password) return alert("Enter username and password");

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

        loginOverlay.style.display = "none";
        logoutBtn.style.display = "block";
        loginError.style.display = "none";

        showNotification(`Welcome ${currentUser}!`);

        usernameInput.value = "";
        passwordInput.value = "";

        resetState();
        await loadUserResults();
      } else {
        loginError.style.display = "block";
        loginError.innerText = data.error || "Invalid credentials";
      }
    } catch (err) {
      console.error(err);
      showNotification("Server error", "error");
    }
  });

  // Toggle login/signup
  usernameInput.insertAdjacentHTML("afterend", `<p id="toggleAuth" style="cursor:pointer;color:#667eea;margin-top:10px;text-decoration:underline;">Don't have an account? Sign Up</p>`);
  const toggleAuth = document.getElementById("toggleAuth");
  toggleAuth.addEventListener("click", () => {
    isLogin = !isLogin;
    loginBtn.innerText = isLogin ? "Login" : "Sign Up";
    toggleAuth.innerText = isLogin
      ? "Don't have an account? Sign Up"
      : "Already have an account? Login";
    loginError.style.display = "none";
  });

  // ---------------- LOGOUT ----------------
  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("currentUser");
    localStorage.removeItem("token");
    currentUser = null;
    loginOverlay.style.display = "flex";
    logoutBtn.style.display = "none";

    resetState();
    showNotification("Logged out");
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
      loginOverlay.style.display = "flex";
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

  function renderFiles() {
    fileList.innerHTML = files.map((f,i) => {
      const uploadingText = uploading.has(f.name) ? "Uploading..." : "";
      return `<div class="file-item">
        <div>${getFileIcon(f.name)} <strong>${f.name}</strong></div>
        <div>${uploadingText} <button class="btn-remove" data-index="${i}">Remove</button></div>
      </div>`;
    }).join("");

    document.querySelectorAll(".btn-remove").forEach(btn => {
      btn.onclick = e => {
        const idx = Number(e.target.dataset.index);
        files.splice(idx,1);
        renderFiles();
      };
    });
  }

  function renderResults() {
    if (!results.length) {
      resultsContainer.innerHTML = `<div class="empty-state">📄 No results yet.</div>`;
      return;
    }
    resultsContainer.innerHTML = results.map(r => `
      <div class="result-item">
        <h4>${getFileIcon(r.fileName)} ${r.fileName}</h4>
        <div>${r.summary || "No summary"}</div>
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
