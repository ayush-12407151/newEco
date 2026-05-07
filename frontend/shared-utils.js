/**
 * EcoPickup — Shared Utility Functions
 * Used across dashboard-script.js, request-pages.js, admin-pages.js
 */

const API_BASE_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.protocol === "file:" ? "http://localhost:5000" : "https://waste-managment-39g8.onrender.com";

const getStoredToken = () => localStorage.getItem("token");

const getStoredUser = () => {
  const stored = localStorage.getItem("user");
  return stored ? JSON.parse(stored) : null;
};

const clearStoredSession = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatRequestId = (id) => {
  if (!id) return "--";
  return `REQ-${String(id).slice(-4).toUpperCase()}`;
};

const formatRequestDate = (value) => {
  if (!value) return "--";
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return "--";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(parsedDate);
};

const getStatusTone = (status) => {
  const s = String(status || "").toLowerCase();
  if (s === "completed") return "green";
  if (s === "in progress") return "blue";
  if (s === "cancelled") return "red";
  return "orange";
};

const handleUnauthorizedResponse = (response, role) => {
  if (response.status !== 401) return false;
  clearStoredSession();
  window.location.replace(`/login/${role || "user"}`);
  return true;
};

/* ─── Toast Notification System ─── */

const ensureToastContainer = () => {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }
  return container;
};

/**
 * Show a toast notification
 * @param {string} message
 * @param {"success"|"error"|"warning"|"info"} type
 * @param {number} duration ms
 */
const showToast = (message, type = "info", duration = 4000) => {
  const container = ensureToastContainer();
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const icons = { success: "✓", error: "✕", warning: "⚠", info: "ℹ" };
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">×</button>
  `;

  container.appendChild(toast);

  // Trigger entrance animation
  requestAnimationFrame(() => toast.classList.add("toast-visible"));

  setTimeout(() => {
    toast.classList.remove("toast-visible");
    toast.classList.add("toast-exit");
    setTimeout(() => toast.remove(), 350);
  }, duration);
};

/* ─── Confirm Dialog ─── */

/**
 * Show a confirmation modal. Returns a Promise that resolves to true/false.
 * @param {string} title
 * @param {string} message
 * @param {string} confirmText
 * @param {"danger"|"primary"} confirmStyle
 */
const showConfirmDialog = (title, message, confirmText = "Confirm", confirmStyle = "danger") => {
  return new Promise((resolve) => {
    // Remove any existing confirm dialog
    const existing = document.getElementById("confirm-dialog-overlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "confirm-dialog-overlay";
    overlay.className = "modal-overlay modal-visible";
    overlay.innerHTML = `
      <div class="modal-content confirm-dialog">
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(message)}</p>
        <div class="modal-actions">
          <button class="btn-secondary" id="confirm-cancel">Cancel</button>
          <button class="btn-${confirmStyle}" id="confirm-ok">${escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const cleanup = (result) => {
      overlay.classList.remove("modal-visible");
      setTimeout(() => overlay.remove(), 250);
      resolve(result);
    };

    overlay.querySelector("#confirm-cancel").addEventListener("click", () => cleanup(false));
    overlay.querySelector("#confirm-ok").addEventListener("click", () => cleanup(true));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) cleanup(false); });
  });
};

/* ─── Skeleton Loaders ─── */

/**
 * Generate skeleton table rows
 * @param {number} cols - number of columns
 * @param {number} rows - number of rows
 */
const createSkeletonRows = (cols, rows = 4) => {
  let html = "";
  for (let r = 0; r < rows; r++) {
    html += "<tr>";
    for (let c = 0; c < cols; c++) {
      const width = 40 + Math.random() * 50;
      html += `<td><div class="skeleton-bar" style="width:${width}%"></div></td>`;
    }
    html += "</tr>";
  }
  return html;
};

/* ─── Dark Mode ─── */

const initDarkMode = () => {
  const saved = localStorage.getItem("darkMode");
  if (saved === "true") {
    document.body.classList.add("dark-mode");
  }
};

const toggleDarkMode = () => {
  const isDark = document.body.classList.toggle("dark-mode");
  localStorage.setItem("darkMode", isDark);
  return isDark;
};

// Initialize dark mode on load
initDarkMode();
