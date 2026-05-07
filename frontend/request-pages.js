/**
 * request-pages.js — Logic for /requests/ and /admin/requests/ pages
 * Depends on shared-utils.js being loaded first
 */

const pageUser = getStoredUser();
const pageRole = document.body.dataset.role;
const pageType = document.body.dataset.page;
const pageDateLabel = document.getElementById("dashboard-date");
const pageUserNameLabel = document.getElementById("dashboard-user-name");
const pageUserRoleLabel = document.getElementById("dashboard-user-role");
const pageLogoutButton = document.getElementById("dashboard-logout");
const pageStatusMessage = document.getElementById("page-status-message");
const newRequestForm = document.getElementById("new-request-form");
const userRequestsTableBody = document.getElementById("user-requests-table-body");
const adminRequestsTableBody = document.getElementById("admin-requests-table-body");
const PAGE_SIZE = 10;

// Auth guard
if (!pageUser || !pageUser.role) window.location.replace(`/login/${pageRole || "user"}`);
const pageRoutes = { user: "/dashboard/user/", worker: "/dashboard/worker/", admin: "/dashboard/admin/" };
if (pageUser && pageRole && pageUser.role !== pageRole) window.location.replace(pageRoutes[pageUser.role] || "/login/user");

// Socket.io
let socket = null;
if (typeof io !== "undefined") {
  socket = io(API_BASE_URL);
  socket.on("notification", (data) => {
    if (pageUser && data.userId === pageUser.id) {
      showToast("🔔 " + data.message, "info");
      if (pageType === "my-requests") loadMyRequestsPage();
      if (pageType === "admin-requests") loadAdminRequestsPage();
    }
  });
  socket.on("admin-update", () => {
    if (pageType === "admin-requests") loadAdminRequestsPage();
  });
}

// Common UI setup
if (pageDateLabel) pageDateLabel.textContent = new Intl.DateTimeFormat("en-IN", { dateStyle: "full" }).format(new Date());
if (pageUserNameLabel && pageUser) pageUserNameLabel.textContent = pageUser.name || "Account";
if (pageUserRoleLabel && pageUser) pageUserRoleLabel.textContent = `${pageUser.role} account`;

// Sidebar
const sidebarToggle = document.getElementById("sidebar-toggle");
const sidebarEl = document.getElementById("dashboard-sidebar");
if (sidebarToggle && sidebarEl) {
  sidebarToggle.addEventListener("click", () => sidebarEl.classList.toggle("sidebar-open"));
  document.addEventListener("click", (e) => {
    if (sidebarEl.classList.contains("sidebar-open") && !sidebarEl.contains(e.target) && e.target !== sidebarToggle)
      sidebarEl.classList.remove("sidebar-open");
  });
}

// Dark mode
const dmToggle = document.getElementById("dark-mode-toggle");
if (dmToggle) {
  const updateDM = () => {
    const isDark = document.body.classList.contains("dark-mode");
    const icon = document.getElementById("dark-mode-icon");
    const label = document.getElementById("dark-mode-label");
    if (icon) icon.textContent = isDark ? "☀️" : "🌙";
    if (label) label.textContent = isDark ? "Light Mode" : "Dark Mode";
  };
  updateDM();
  dmToggle.addEventListener("click", () => { toggleDarkMode(); updateDM(); });
}

if (pageLogoutButton) pageLogoutButton.addEventListener("click", () => { clearStoredSession(); window.location.replace(`/login/${pageRole || "user"}`); });

const setPageStatus = (message, type = "") => {
  if (pageStatusMessage) { pageStatusMessage.textContent = message; pageStatusMessage.className = `form-status ${type}`.trim(); }
};

// ══════════════════════════════════════
// ADMIN REQUESTS PAGE
// ══════════════════════════════════════

let allRequests = [];
let allWorkers = [];
let requestsPage = 1;

window.assignWorker = async (requestId) => {
  const select = document.getElementById(`worker-select-${requestId}`);
  if (!select) return;
  const workerId = select.value;
  if (!workerId) { showToast("Please select a worker first.", "warning"); return; }

  const ok = await showConfirmDialog("Assign Worker", "Assign this worker to the request?", "Assign", "primary");
  if (!ok) return;

  const token = getStoredToken();
  try {
    setPageStatus("Assigning worker...");
    const res = await fetch(`${API_BASE_URL}/api/admin/requests/${requestId}/assign`, {
      method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ workerId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to assign");
    showToast("Worker assigned successfully!", "success");
    setPageStatus("Worker assigned!", "success");
    loadAdminRequestsPage();
  } catch (err) { showToast(err.message, "error"); setPageStatus(err.message, "error"); }
};

window.cancelRequestAction = async (requestId) => {
  const ok = await showConfirmDialog("Cancel Request", "Are you sure you want to cancel this request?", "Cancel Request", "danger");
  if (!ok) return;
  const token = getStoredToken();
  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/requests/${requestId}/cancel`, {
      method: "PUT", headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to cancel");
    showToast("Request cancelled", "success");
    loadAdminRequestsPage();
  } catch (err) { showToast(err.message, "error"); }
};

window.deleteRequestAction = async (requestId) => {
  const ok = await showConfirmDialog("Delete Request", "Permanently delete this request? This cannot be undone.", "Delete", "danger");
  if (!ok) return;
  const token = getStoredToken();
  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/requests/${requestId}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to delete");
    showToast("Request deleted", "success");
    loadAdminRequestsPage();
  } catch (err) { showToast(err.message, "error"); }
};

window.viewRequestDetail = async (requestId) => {
  const modal = document.getElementById("request-detail-modal");
  const body = document.getElementById("request-detail-body");
  if (!modal || !body) return;

  modal.classList.add("modal-visible");
  body.innerHTML = `<div class="skeleton-bar" style="width:80%;margin:10px 0"></div><div class="skeleton-bar" style="width:60%;margin:10px 0"></div>`;

  const token = getStoredToken();
  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/requests/${requestId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to load details");

    const r = data.request;
    const user = r.userId || {};
    const worker = r.assignedWorker || null;
    const wp = data.workerProfile;

    body.innerHTML = `
      <div class="detail-grid">
        <div class="detail-item"><label>Request ID</label><span>${formatRequestId(r._id)}</span></div>
        <div class="detail-item"><label>Status</label><span class="status-pill ${getStatusTone(r.status)}">${escapeHtml(r.status)}</span></div>
        <div class="detail-item"><label>Citizen</label><span>${escapeHtml(user.name || '--')} (${escapeHtml(user.email || '--')})</span></div>
        <div class="detail-item"><label>Worker Status</label><span>${escapeHtml(r.workerStatus || 'Unassigned')}</span></div>
        <div class="detail-item"><label>Location</label><span>${escapeHtml(r.location || '--')}</span></div>
        <div class="detail-item"><label>Address</label><span>${escapeHtml(r.address || '--')}</span></div>
        <div class="detail-item"><label>Category</label><span>${escapeHtml(r.wasteCategory || 'General')}</span></div>
        <div class="detail-item"><label>Pickup Type</label><span>${escapeHtml(r.pickupType || 'home')}</span></div>
        <div class="detail-item"><label>Created</label><span>${formatRequestDate(r.createdAt)}</span></div>
        <div class="detail-item"><label>Rating</label><span>${r.userRating ? `${r.userRating}/5 ⭐` : 'Not rated'}</span></div>
        ${worker ? `<div class="detail-item"><label>Assigned Worker</label><span>${escapeHtml(worker.name)} (${escapeHtml(worker.email)})</span></div>` : ''}
        ${wp ? `<div class="detail-item"><label>Worker Rating</label><span>${wp.averageRating?.toFixed(1) || '0'} ⭐ (${wp.totalRatings || 0} reviews)</span></div>` : ''}
        <div class="detail-item detail-full"><label>Description</label><span>${escapeHtml(r.description || '--')}</span></div>
        ${r.imageUrl ? `<div class="detail-item detail-full"><label>Attached Image</label><img src="${r.imageUrl}" class="detail-image" alt="Request image" /></div>` : ''}
        ${r.proofImageUrl ? `<div class="detail-item detail-full"><label>Proof Image</label><img src="${r.proofImageUrl}" class="detail-image" alt="Proof image" /></div>` : ''}
        ${r.rejectionReason ? `<div class="detail-item detail-full"><label>Rejection Reason</label><span>${escapeHtml(r.rejectionReason)}</span></div>` : ''}
      </div>`;
  } catch (err) {
    body.innerHTML = `<p style="color:var(--dash-danger)">${escapeHtml(err.message)}</p>`;
  }
};

// Close detail modal
const closeDetailBtn = document.getElementById("close-detail-modal");
const detailModal = document.getElementById("request-detail-modal");
if (closeDetailBtn && detailModal) {
  closeDetailBtn.addEventListener("click", () => detailModal.classList.remove("modal-visible"));
  detailModal.addEventListener("click", (e) => { if (e.target === detailModal) detailModal.classList.remove("modal-visible"); });
}

const loadAdminRequestsPage = async () => {
  if (pageType !== "admin-requests" || !adminRequestsTableBody) return;
  const token = getStoredToken();
  if (!token) { adminRequestsTableBody.innerHTML = `<tr><td colspan="6">Please log in.</td></tr>`; return; }

  adminRequestsTableBody.innerHTML = createSkeletonRows(6, 5);

  try {
    setPageStatus("Loading requests...");
    const [reqRes, wRes] = await Promise.all([
      fetch(`${API_BASE_URL}/api/requests`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_BASE_URL}/api/admin/workers`, { headers: { Authorization: `Bearer ${token}` } })
    ]);
    if (handleUnauthorizedResponse(reqRes, "admin")) return;
    const reqData = await reqRes.json();
    const wData = await wRes.json();
    if (!reqRes.ok) throw new Error(reqData.msg || reqData.message || "Failed");

    allRequests = Array.isArray(reqData.allRequests) ? reqData.allRequests : [];
    allWorkers = Array.isArray(wData) ? wData : [];
    requestsPage = 1;
    renderFilteredRequests();
    setPageStatus(`Loaded ${allRequests.length} request(s).`, "success");
  } catch (err) {
    adminRequestsTableBody.innerHTML = `<tr><td colspan="6">${escapeHtml(err.message)}</td></tr>`;
    setPageStatus(err.message, "error");
  }
};

const renderFilteredRequests = () => {
  const search = (document.getElementById("request-search")?.value || "").toLowerCase();
  const statusFilter = document.getElementById("filter-status")?.value || "";
  const assignFilter = document.getElementById("filter-assignment")?.value || "";

  let filtered = allRequests.filter(r => {
    const matchSearch = !search || (r.description || "").toLowerCase().includes(search) || (r.location || "").toLowerCase().includes(search) || formatRequestId(r._id).toLowerCase().includes(search);
    const matchStatus = !statusFilter || r.status === statusFilter;
    const matchAssign = !assignFilter || (assignFilter === "assigned" ? r.assignedWorker : !r.assignedWorker);
    return matchSearch && matchStatus && matchAssign;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (requestsPage > totalPages) requestsPage = totalPages;
  const start = (requestsPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);

  const workerOpts = allWorkers.map(w => `<option value="${w._id}">${escapeHtml(w.name)} (${w.availability || 'Offline'})</option>`).join("");

  if (pageItems.length === 0) {
    adminRequestsTableBody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">📋</div><p>No requests match your filters</p></div></td></tr>`;
  } else {
    adminRequestsTableBody.innerHTML = pageItems.map(r => {
      let actions = `<button class="btn-secondary btn-sm" onclick="viewRequestDetail('${r._id}')" style="margin-right:4px">View</button>`;
      if (r.status === "Pending") {
        actions += `<select id="worker-select-${r._id}" class="dashboard-input" style="padding:4px;width:110px;font-size:0.78rem;margin-right:4px;display:inline;border-radius:8px">
          <option value="">Worker</option>${workerOpts}</select>
          <button onclick="assignWorker('${r._id}')" class="primary-button btn-sm" style="margin-right:4px">Assign</button>`;
      }
      if (r.status !== "Completed" && r.status !== "Cancelled") {
        actions += `<button class="btn-danger btn-sm" onclick="cancelRequestAction('${r._id}')" style="margin-right:4px">Cancel</button>`;
      }
      actions += `<button class="btn-danger btn-sm" onclick="deleteRequestAction('${r._id}')" style="background:#666">🗑</button>`;

      return `<tr>
        <td>${escapeHtml(formatRequestId(r._id))}</td>
        <td>${escapeHtml(r.description || "--")}</td>
        <td>${escapeHtml(r.location || "--")}</td>
        <td><span class="status-pill ${getStatusTone(r.status)}">${escapeHtml(r.status || "Pending")}</span></td>
        <td>${escapeHtml(r.assignedWorker ? "Assigned" : "Unassigned")}</td>
        <td style="white-space:nowrap">${actions}</td>
      </tr>`;
    }).join("");
  }

  renderPagination("requests-pagination", requestsPage, totalPages, (p) => { requestsPage = p; renderFilteredRequests(); });
};

// ─── Pagination ───
const renderPagination = (containerId, currentPage, totalPages, onPageChange) => {
  const container = document.getElementById(containerId);
  if (!container || totalPages <= 1) { if (container) container.innerHTML = ""; return; }
  let html = `<button ${currentPage <= 1 ? "disabled" : ""} data-page="${currentPage - 1}">← Prev</button>`;
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
    btn.addEventListener("click", () => { const p = parseInt(btn.dataset.page); if (p >= 1 && p <= totalPages) onPageChange(p); });
  });
};

// ─── Filter listeners ───
document.getElementById("request-search")?.addEventListener("input", () => { requestsPage = 1; renderFilteredRequests(); });
document.getElementById("filter-status")?.addEventListener("change", () => { requestsPage = 1; renderFilteredRequests(); });
document.getElementById("filter-assignment")?.addEventListener("change", () => { requestsPage = 1; renderFilteredRequests(); });

// ══════════════════════════════════════
// USER REQUESTS PAGE (my-requests)
// ══════════════════════════════════════

const loadMyRequestsPage = async () => {
  if (pageType !== "my-requests" || !userRequestsTableBody) return;
  const token = getStoredToken();
  if (!token) { userRequestsTableBody.innerHTML = `<tr><td colspan="5">Please log in.</td></tr>`; return; }
  try {
    setPageStatus("Loading your requests...");
    const res = await fetch(`${API_BASE_URL}/api/requests/my`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (handleUnauthorizedResponse(res, "user")) return;
    if (!res.ok) throw new Error(data.msg || data.message || "Unable to load");
    const requests = Array.isArray(data.allRequests) ? data.allRequests : [];
    if (requests.length === 0) { userRequestsTableBody.innerHTML = `<tr><td colspan="5">No requests found yet.</td></tr>`; setPageStatus("No requests.", "success"); return; }
    userRequestsTableBody.innerHTML = requests.map(r => {
      let actionBtn = '--';
      if (r.status === 'Completed') {
        actionBtn = r.userRating ? `<span style="color:var(--dash-muted);font-size:12px">Rated ${r.userRating}/5</span>` : `<button onclick="window.openRatingModal('${r._id}')" class="primary-button btn-sm">Rate</button>`;
      }
      return `<tr><td>${escapeHtml(formatRequestId(r._id))}</td><td>${escapeHtml(r.description||r.location||"Request")}</td><td><span class="status-pill ${getStatusTone(r.status)}">${escapeHtml(r.status||"Pending")}</span></td><td>${escapeHtml(formatRequestDate(r.createdAt))}</td><td>${actionBtn}</td></tr>`;
    }).join("");
    setPageStatus(`Loaded ${requests.length} request(s).`, "success");
  } catch (err) {
    userRequestsTableBody.innerHTML = `<tr><td colspan="5">${escapeHtml(err.message)}</td></tr>`;
    setPageStatus(err.message, "error");
  }
};

// ─── GPS Location ───
const getLocationBtn = document.getElementById("get-location-btn");
if (getLocationBtn) {
  getLocationBtn.addEventListener("click", () => {
    if ("geolocation" in navigator) {
      getLocationBtn.textContent = "Locating...";
      navigator.geolocation.getCurrentPosition(async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
          const data = await res.json();
          document.getElementById("request-location").value = data.display_name || `${latitude}, ${longitude}`;
        } catch { document.getElementById("request-location").value = `${pos.coords.latitude}, ${pos.coords.longitude}`; }
        getLocationBtn.textContent = "📍 Get GPS";
      }, () => { showToast("Unable to get location", "error"); getLocationBtn.textContent = "📍 Get GPS"; });
    } else showToast("Geolocation not supported", "error");
  });
}

// ─── New Request Form ───
if (newRequestForm) {
  newRequestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const token = getStoredToken();
    if (!token) { setPageStatus("Please log in.", "error"); window.location.replace("/login/user"); return; }
    const formData = new FormData(newRequestForm);
    if (!formData.get("description") || !formData.get("location")) { setPageStatus("Description and location are required.", "error"); return; }
    try {
      setPageStatus("Submitting...");
      const res = await fetch(`${API_BASE_URL}/api/requests`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData });
      const data = await res.json();
      if (handleUnauthorizedResponse(res, "user")) return;
      if (!res.ok) throw new Error(data.msg || data.message || "Unable to submit");
      newRequestForm.reset();
      setPageStatus(`Request submitted! ID: ${formatRequestId(data.reqId)}`, "success");
      showToast("Request submitted!", "success");
    } catch (err) { setPageStatus(err.message, "error"); }
  });
}

// ─── Rating Modal ───
let currentRatingRequestId = null, currentRatingValue = 0;
window.openRatingModal = (requestId) => {
  currentRatingRequestId = requestId;
  currentRatingValue = 0;
  const modal = document.getElementById("rating-modal");
  const statusEl = document.getElementById("rating-status");
  const submitBtn = document.getElementById("submit-rating-btn");
  if (modal) modal.style.display = "flex";
  if (statusEl) statusEl.textContent = "";
  if (submitBtn) submitBtn.disabled = true;
  document.querySelectorAll("#rating-stars span").forEach(s => s.style.color = "var(--dash-muted)");
};
const closeRatingModal = () => { currentRatingRequestId = null; const m = document.getElementById("rating-modal"); if (m) m.style.display = "none"; };
const cancelRatingBtn = document.getElementById("cancel-rating-btn");
if (cancelRatingBtn) cancelRatingBtn.addEventListener("click", closeRatingModal);
document.querySelectorAll("#rating-stars span").forEach(star => {
  star.addEventListener("click", (e) => {
    currentRatingValue = parseInt(e.target.dataset.value);
    document.querySelectorAll("#rating-stars span").forEach(s => { s.style.color = parseInt(s.dataset.value) <= currentRatingValue ? "#fbbf24" : "var(--dash-muted)"; });
    document.getElementById("submit-rating-btn").disabled = false;
  });
});
const submitRatingBtn = document.getElementById("submit-rating-btn");
if (submitRatingBtn) {
  submitRatingBtn.addEventListener("click", async () => {
    if (!currentRatingRequestId || currentRatingValue === 0) return;
    const token = getStoredToken();
    const statusEl = document.getElementById("rating-status");
    try {
      if (statusEl) { statusEl.textContent = "Submitting..."; statusEl.className = "form-status"; }
      submitRatingBtn.disabled = true;
      const res = await fetch(`${API_BASE_URL}/api/requests/${currentRatingRequestId}/rate`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rating: currentRatingValue })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.msg || "Failed");
      closeRatingModal();
      showToast("Rating submitted!", "success");
      loadMyRequestsPage();
    } catch (err) {
      if (statusEl) { statusEl.textContent = err.message; statusEl.className = "form-status error"; }
      submitRatingBtn.disabled = false;
    }
  });
}

// Init
loadMyRequestsPage();
loadAdminRequestsPage();
