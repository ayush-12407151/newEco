/**
 * admin-pages.js — Logic for /admin/workers/ and /admin/users/ pages
 * Depends on shared-utils.js being loaded first
 */

const pageUser = getStoredUser();
const pageRole = document.body.dataset.role;
const pageType = document.body.dataset.page;
const PAGE_SIZE = 10;

// ─── Auth guard ───
if (!pageUser || pageUser.role !== "admin") {
  window.location.replace("/login/user");
}

// ─── Common UI setup ───
const setupCommonUI = () => {
  const dateEl = document.getElementById("dashboard-date");
  if (dateEl) dateEl.textContent = new Intl.DateTimeFormat("en-IN", { dateStyle: "full" }).format(new Date());

  const nameEl = document.getElementById("dashboard-user-name");
  if (nameEl) nameEl.textContent = pageUser.name || "Admin";

  const roleEl = document.getElementById("dashboard-user-role");
  if (roleEl) roleEl.textContent = "admin account";

  // Sidebar toggle
  const toggle = document.getElementById("sidebar-toggle");
  const sidebar = document.getElementById("dashboard-sidebar");
  if (toggle && sidebar) {
    toggle.addEventListener("click", () => sidebar.classList.toggle("sidebar-open"));
    document.addEventListener("click", (e) => {
      if (sidebar.classList.contains("sidebar-open") && !sidebar.contains(e.target) && e.target !== toggle) {
        sidebar.classList.remove("sidebar-open");
      }
    });
  }

  // Dark mode
  const dmToggle = document.getElementById("dark-mode-toggle");
  const dmIcon = document.getElementById("dark-mode-icon");
  const dmLabel = document.getElementById("dark-mode-label");
  const updateDMLabel = () => {
    const isDark = document.body.classList.contains("dark-mode");
    if (dmIcon) dmIcon.textContent = isDark ? "☀️" : "🌙";
    if (dmLabel) dmLabel.textContent = isDark ? "Light Mode" : "Dark Mode";
  };
  updateDMLabel();
  if (dmToggle) dmToggle.addEventListener("click", () => { toggleDarkMode(); updateDMLabel(); });

  // Logout
  const logoutBtn = document.getElementById("dashboard-logout");
  if (logoutBtn) logoutBtn.addEventListener("click", () => { clearStoredSession(); window.location.replace("/login/user"); });
};

// ─── Socket.io ───
let socket = null;
if (typeof io !== "undefined") {
  socket = io(API_BASE_URL);
  socket.on("admin-update", () => {
    if (pageType === "admin-workers") loadWorkersPage();
    if (pageType === "admin-users") loadUsersPage();
  });
}

// ══════════════════════════════════════════
// WORKERS PAGE
// ══════════════════════════════════════════
let allWorkers = [];
let workersPage = 1;

const loadWorkersPage = async () => {
  if (pageType !== "admin-workers") return;
  const tbody = document.getElementById("workers-table-body");
  if (!tbody) return;

  const token = getStoredToken();
  if (!token) return window.location.replace("/login/user");

  tbody.innerHTML = createSkeletonRows(6, 5);

  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/workers`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (handleUnauthorizedResponse(res, "admin")) return;
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to load workers");

    allWorkers = Array.isArray(data) ? data : [];
    workersPage = 1;
    renderFilteredWorkers();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6">${escapeHtml(err.message)}</td></tr>`;
    showToast(err.message, "error");
  }
};

const renderFilteredWorkers = () => {
  const search = (document.getElementById("worker-search")?.value || "").toLowerCase();
  const availability = document.getElementById("filter-availability")?.value || "";

  let filtered = allWorkers.filter(w => {
    const matchSearch = !search || w.name.toLowerCase().includes(search) || w.email.toLowerCase().includes(search);
    const matchAvail = !availability || w.availability === availability;
    return matchSearch && matchAvail;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (workersPage > totalPages) workersPage = totalPages;
  const start = (workersPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);

  const tbody = document.getElementById("workers-table-body");
  if (!tbody) return;

  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">👷</div><p>No workers found</p></div></td></tr>`;
  } else {
    tbody.innerHTML = pageItems.map(w => {
      const statusTone = w.availability === "Available" ? "green" : w.availability === "Busy" ? "orange" : "red";
      const rating = w.averageRating ? `${w.averageRating.toFixed(1)} ⭐ (${w.totalRatings || 0})` : "No ratings";
      return `<tr>
        <td><strong>${escapeHtml(w.name)}</strong><br><small style="color:var(--dash-muted)">${escapeHtml(w.email)}</small></td>
        <td><span class="status-pill ${statusTone}">${escapeHtml(w.availability || "Offline")}</span></td>
        <td>${w.activeTasks || 0}</td>
        <td><strong>${w.completedTasks || 0}</strong></td>
        <td>${rating}</td>
        <td><button class="btn-danger btn-sm" onclick="deleteWorkerAction('${w._id}', '${escapeHtml(w.name)}')">Delete</button></td>
      </tr>`;
    }).join("");
  }

  renderPagination("workers-pagination", workersPage, totalPages, (p) => { workersPage = p; renderFilteredWorkers(); });
};

window.deleteWorkerAction = async (workerId, name) => {
  const ok = await showConfirmDialog("Delete Worker", `Are you sure you want to remove "${name}"? Their active tasks will be unassigned.`, "Delete", "danger");
  if (!ok) return;
  const token = getStoredToken();
  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/workers/${workerId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to delete worker");
    showToast("Worker deleted successfully", "success");
    loadWorkersPage();
  } catch (err) {
    showToast(err.message, "error");
  }
};

// ─── Create Worker Form ───
const createWorkerForm = document.getElementById("create-worker-form");
if (createWorkerForm) {
  createWorkerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById("worker-form-status");
    const name = document.getElementById("worker-name").value;
    const email = document.getElementById("worker-email").value;
    const password = document.getElementById("worker-password").value;

    if (password.length < 6) {
      if (statusEl) { statusEl.textContent = "Password must be at least 6 characters"; statusEl.className = "form-status error"; }
      return;
    }

    const ok = await showConfirmDialog("Create Worker", `Create a new worker account for "${name}" (${email})?`, "Create", "primary");
    if (!ok) return;

    const token = getStoredToken();
    try {
      if (statusEl) { statusEl.textContent = "Creating worker..."; statusEl.className = "form-status"; }
      const res = await fetch(`${API_BASE_URL}/api/admin/workers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to create worker");

      showToast("Worker created successfully!", "success");
      if (statusEl) { statusEl.textContent = "Worker created!"; statusEl.className = "form-status success"; }
      createWorkerForm.reset();
      loadWorkersPage();
    } catch (err) {
      showToast(err.message, "error");
      if (statusEl) { statusEl.textContent = err.message; statusEl.className = "form-status error"; }
    }
  });
}

// ══════════════════════════════════════════
// USERS PAGE
// ══════════════════════════════════════════
let allUsers = [];
let usersPage = 1;

const loadUsersPage = async () => {
  if (pageType !== "admin-users") return;
  const tbody = document.getElementById("users-table-body");
  if (!tbody) return;

  const token = getStoredToken();
  if (!token) return window.location.replace("/login/user");

  tbody.innerHTML = createSkeletonRows(6, 5);

  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (handleUnauthorizedResponse(res, "admin")) return;
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to load users");

    allUsers = Array.isArray(data) ? data : [];
    usersPage = 1;
    renderFilteredUsers();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6">${escapeHtml(err.message)}</td></tr>`;
    showToast(err.message, "error");
  }
};

const renderFilteredUsers = () => {
  const search = (document.getElementById("user-search")?.value || "").toLowerCase();

  let filtered = allUsers.filter(u => {
    return !search || u.name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (usersPage > totalPages) usersPage = totalPages;
  const start = (usersPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);

  const tbody = document.getElementById("users-table-body");
  if (!tbody) return;

  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">👥</div><p>No users found</p></div></td></tr>`;
  } else {
    tbody.innerHTML = pageItems.map(u => `<tr>
      <td><strong>${escapeHtml(u.name)}</strong></td>
      <td>${escapeHtml(u.email)}</td>
      <td><span class="status-pill green">${u.points || 0} pts</span></td>
      <td>${u.totalRequests || 0} (${u.completedRequests || 0} done)</td>
      <td>${formatRequestDate(u.createdAt)}</td>
      <td><button class="btn-danger btn-sm" onclick="deleteUserAction('${u._id}', '${escapeHtml(u.name)}')">Delete</button></td>
    </tr>`).join("");
  }

  renderPagination("users-pagination", usersPage, totalPages, (p) => { usersPage = p; renderFilteredUsers(); });
};

window.deleteUserAction = async (userId, name) => {
  const ok = await showConfirmDialog("Delete User", `Are you sure you want to remove "${name}"? Their request history will be preserved.`, "Delete", "danger");
  if (!ok) return;
  const token = getStoredToken();
  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/users/${userId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to delete user");
    showToast("User deleted successfully", "success");
    loadUsersPage();
  } catch (err) {
    showToast(err.message, "error");
  }
};

// ─── Shared Pagination Renderer ───
const renderPagination = (containerId, currentPage, totalPages, onPageChange) => {
  const container = document.getElementById(containerId);
  if (!container || totalPages <= 1) { if (container) container.innerHTML = ""; return; }

  let html = `<button ${currentPage <= 1 ? "disabled" : ""} onclick="void(0)" data-page="${currentPage - 1}">← Prev</button>`;
  for (let i = 1; i <= totalPages; i++) {
    if (totalPages > 7 && i > 2 && i < totalPages - 1 && Math.abs(i - currentPage) > 1) {
      if (i === 3 || i === totalPages - 2) html += `<button disabled>…</button>`;
      continue;
    }
    html += `<button class="${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
  }
  html += `<button ${currentPage >= totalPages ? "disabled" : ""} data-page="${currentPage + 1}">Next →</button>`;
  container.innerHTML = html;

  container.querySelectorAll("button[data-page]").forEach(btn => {
    btn.addEventListener("click", () => {
      const p = parseInt(btn.dataset.page);
      if (p >= 1 && p <= totalPages) onPageChange(p);
    });
  });
};

// ─── Filter listeners ───
document.getElementById("worker-search")?.addEventListener("input", () => { workersPage = 1; renderFilteredWorkers(); });
document.getElementById("filter-availability")?.addEventListener("change", () => { workersPage = 1; renderFilteredWorkers(); });
document.getElementById("user-search")?.addEventListener("input", () => { usersPage = 1; renderFilteredUsers(); });

// ─── Init ───
setupCommonUI();
loadWorkersPage();
loadUsersPage();
