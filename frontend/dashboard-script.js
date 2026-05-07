/**
 * dashboard-script.js — Main dashboard logic for user, worker, admin dashboards.
 * Depends on shared-utils.js being loaded first for admin pages.
 */

const storedUser = localStorage.getItem("user");
const dashboardUser = storedUser ? JSON.parse(storedUser) : null;
const dashboardRole = document.body.dataset.role;
const dateLabel = document.getElementById("dashboard-date");
const userNameLabel = document.getElementById("dashboard-user-name");
const userRoleLabel = document.getElementById("dashboard-user-role");
const profileNameLabel = document.getElementById("dashboard-profile-name");
const profileRoleLabel = document.getElementById("dashboard-profile-role");
const logoutButton = document.getElementById("dashboard-logout");
const openRequestsCount = document.getElementById("open-requests-count");
const completedRequestsCount = document.getElementById("completed-requests-count");
const rewardPointsCount = document.getElementById("reward-points-count");
const areaCleanlinessStatus = document.getElementById("area-cleanliness-status");
const userRequestsTableBody = document.getElementById("user-requests-table-body");
const newRequestForm = document.getElementById("new-request-form");
const newRequestStatus = document.getElementById("new-request-status");
const _API = typeof API_BASE_URL !== "undefined" ? API_BASE_URL : (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.protocol === "file:" ? "http://localhost:5000" : "https://waste-managment-39g8.onrender.com");

// Fallbacks for non-admin pages that don't load shared-utils.js
const _escapeHtml = typeof escapeHtml === "function" ? escapeHtml : (v) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const _formatRequestId = typeof formatRequestId === "function" ? formatRequestId : (id) => id ? `REQ-${String(id).slice(-4).toUpperCase()}` : "--";
const _formatRequestDate = typeof formatRequestDate === "function" ? formatRequestDate : (v) => { if(!v) return "--"; const d=new Date(v); return isNaN(d)?  "--": d.toLocaleDateString("en-IN",{dateStyle:"medium"}); };
const _getStatusTone = typeof getStatusTone === "function" ? getStatusTone : (s) => { s=String(s||"").toLowerCase(); if(s==="completed") return "green"; if(s==="in progress") return "blue"; if(s==="cancelled") return "red"; return "orange"; };
const _getStoredToken = typeof getStoredToken === "function" ? getStoredToken : () => localStorage.getItem("token");
const _clearSession = typeof clearStoredSession === "function" ? clearStoredSession : () => { localStorage.removeItem("token"); localStorage.removeItem("user"); };
const _showToast = typeof showToast === "function" ? showToast : (msg) => { /* silent fallback */ };
const _showConfirm = typeof showConfirmDialog === "function" ? showConfirmDialog : (t,m) => Promise.resolve(confirm(m));
const _skeletonRows = typeof createSkeletonRows === "function" ? createSkeletonRows : (c,r) => `<tr><td colspan="${c}">Loading...</td></tr>`;

// Socket.io
let socket = null;
if (typeof io !== "undefined") {
  socket = io(_API);
  socket.on("notification", (data) => {
    if (dashboardUser && data.userId === dashboardUser.id) {
      _showToast("🔔 " + data.message, "info");
      if (dashboardRole === "user") loadUserRequests();
      if (dashboardRole === "worker") loadWorkerDashboard();
    }
  });
  socket.on("admin-update", () => {
    if (dashboardRole === "admin") loadAdminDashboard();
  });
}

const dashboardRoutes = { user: "/dashboard/user/", worker: "/dashboard/worker/", admin: "/dashboard/admin/" };

if (!dashboardUser || !dashboardUser.role) window.location.replace("/login/user");
if (dashboardUser && dashboardRole && dashboardUser.role !== dashboardRole) {
  window.location.replace(dashboardRoutes[dashboardUser.role] || "/login/user");
}

if (dateLabel) dateLabel.textContent = new Intl.DateTimeFormat("en-IN", { dateStyle: "full" }).format(new Date());
if (userNameLabel && dashboardUser) userNameLabel.textContent = dashboardUser.name || "Account";
if (userRoleLabel && dashboardUser) userRoleLabel.textContent = `${dashboardUser.role} account`;
if (profileNameLabel && dashboardUser) profileNameLabel.textContent = dashboardUser.name || "Assigned field worker";
if (profileRoleLabel && dashboardUser) profileRoleLabel.textContent = `${dashboardUser.role} account`;
if (rewardPointsCount && dashboardUser) rewardPointsCount.textContent = String(dashboardUser.points || 0);

// ─── Sidebar toggle (admin) ───
const sidebarToggle = document.getElementById("sidebar-toggle");
const sidebarEl = document.getElementById("dashboard-sidebar");
if (sidebarToggle && sidebarEl) {
  sidebarToggle.addEventListener("click", () => sidebarEl.classList.toggle("sidebar-open"));
  document.addEventListener("click", (e) => {
    if (sidebarEl.classList.contains("sidebar-open") && !sidebarEl.contains(e.target) && e.target !== sidebarToggle) {
      sidebarEl.classList.remove("sidebar-open");
    }
  });
}

// ─── Dark mode toggle ───
const dmToggle = document.getElementById("dark-mode-toggle");
if (dmToggle && typeof toggleDarkMode === "function") {
  const updateDMUI = () => {
    const isDark = document.body.classList.contains("dark-mode");
    const icon = document.getElementById("dark-mode-icon");
    const label = document.getElementById("dark-mode-label");
    if (icon) icon.textContent = isDark ? "☀️" : "🌙";
    if (label) label.textContent = isDark ? "Light Mode" : "Dark Mode";
  };
  updateDMUI();
  dmToggle.addEventListener("click", () => { toggleDarkMode(); updateDMUI(); });
}

const handleUnauth = (response) => {
  if (response.status !== 401) return false;
  _clearSession();
  window.location.replace(`/login/${dashboardRole || "user"}`);
  return true;
};

// ══════════════════════════════════════
// USER DASHBOARD
// ══════════════════════════════════════

const renderUserRequests = (requests) => {
  if (!userRequestsTableBody) return;
  if (!Array.isArray(requests) || requests.length === 0) {
    userRequestsTableBody.innerHTML = `<tr><td colspan="4">No requests found yet.</td></tr>`;
    return;
  }
  userRequestsTableBody.innerHTML = requests.map(r => `<tr>
    <td>${_escapeHtml(_formatRequestId(r._id))}</td>
    <td>${_escapeHtml(r.description || r.location || "Request")}</td>
    <td><span class="status-pill ${_getStatusTone(r.status)}">${_escapeHtml(r.status || "Pending")}</span></td>
    <td>${_escapeHtml(_formatRequestDate(r.createdAt))}</td>
  </tr>`).join("");
};

const renderRecentActivity = (requests) => {
  const tbody = document.getElementById("user-recent-activity-body");
  if (!tbody) return;
  if (requests.length === 0) { tbody.innerHTML = `<tr><td colspan="3">No recent activity.</td></tr>`; return; }
  tbody.innerHTML = requests.slice(0, 3).map(r => `<tr>
    <td><strong>${_escapeHtml(r.wasteCategory || "General")}</strong></td>
    <td>${_escapeHtml(r.location || "--")}</td>
    <td><span class="status-pill ${_getStatusTone(r.status)}">${_escapeHtml(r.status || "Pending")}</span></td>
  </tr>`).join("");
};

const updateUserRequestSummary = (requests) => {
  if (!Array.isArray(requests)) return;
  const completed = requests.filter(r => String(r.status || "").toLowerCase() === "completed").length;
  const open = requests.length - completed;
  if (openRequestsCount) openRequestsCount.textContent = String(open);
  if (completedRequestsCount) completedRequestsCount.textContent = String(completed);
  if (areaCleanlinessStatus) {
    areaCleanlinessStatus.textContent = requests.length === 0 ? "New" : open === 0 ? "High" : open <= 2 ? "Good" : "Needs attention";
  }
};

const setNewRequestStatus = (message, type = "") => {
  if (newRequestStatus) { newRequestStatus.textContent = message; newRequestStatus.className = `form-status ${type}`.trim(); }
};

const loadUserRequests = async () => {
  if (dashboardRole !== "user") return;
  const token = _getStoredToken();
  if (!token) { if (userRequestsTableBody) userRequestsTableBody.innerHTML = `<tr><td colspan="4">Please log in again.</td></tr>`; return; }
  try {
    const response = await fetch(`${_API}/api/requests/my`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json();
    if (handleUnauth(response)) return;
    if (!response.ok) throw new Error(data.msg || data.message || "Unable to load requests");
    const requests = Array.isArray(data.allRequests) ? data.allRequests : [];
    updateUserRequestSummary(requests);
    renderUserRequests(requests);
    renderRecentActivity(requests);
    await loadUserLeaderboard(token);
  } catch (error) {
    if (userRequestsTableBody) userRequestsTableBody.innerHTML = `<tr><td colspan="4">${_escapeHtml(error.message)}</td></tr>`;
  }
};

const loadUserLeaderboard = async (token) => {
  const body = document.getElementById("user-leaderboard-body");
  if (!body) return;
  try {
    const res = await fetch(`${_API}/api/users/leaderboard`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error("Failed");
    const topUsers = await res.json();
    body.innerHTML = topUsers.map((u, i) => `<tr><td>#${i+1}</td><td><strong>${_escapeHtml(u.name)}</strong></td><td><span class="status-pill green">${u.points||0} pts</span></td></tr>`).join("");
  } catch { body.innerHTML = `<tr><td colspan="3">Could not load</td></tr>`; }
};

// ══════════════════════════════════════
// WORKER DASHBOARD
// ══════════════════════════════════════

window.updateTaskStatus = async (taskId, status) => {
  const token = _getStoredToken();
  if (!token) return;
  
  let payload = { workerStatus: status };
  
  if (status === "Rejected") {
    const reason = prompt("Please enter a reason for rejection:");
    if (reason === null) return; // User cancelled
    payload.rejectionReason = reason || "No reason provided";
  }

  try {
    const res = await fetch(`${_API}/api/worker/tasks/${taskId}/status`, {
      method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("Failed to update status");
    _showToast(`Task updated to ${status}`, "success");
    loadWorkerDashboard();
  } catch (error) { _showToast(error.message, "error"); }
};

const renderWorkerRequests = (requests) => {
  const tbody = document.getElementById("worker-requests-table-body");
  if (!tbody) return;
  if (!Array.isArray(requests) || requests.length === 0) { tbody.innerHTML = `<tr><td colspan="5">No tasks assigned yet.</td></tr>`; return; }
  tbody.innerHTML = requests.map((r, i) => {
    let btn = "";
    if (r.workerStatus === "Assigned") {
      btn = `<div style="display:flex;gap:5px">
        <button onclick="window.updateTaskStatus('${r._id}','Accepted')" class="primary-button btn-sm">Accept</button>
        <button onclick="window.updateTaskStatus('${r._id}','Rejected')" class="btn-danger btn-sm" style="background:#ff4d4d; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">Reject</button>
      </div>`;
    } else if (r.workerStatus === "Accepted" || r.workerStatus === "Started") {
      const startBtn = r.workerStatus === "Accepted" ? `<button onclick="window.updateTaskStatus('${r._id}','Started')" class="primary-button btn-sm" style="margin-right:5px">Start Trip</button>` : "";
      const completeBtn = `<button onclick="window.updateTaskStatus('${r._id}','Completed')" class="btn-danger btn-sm" style="background:var(--success); color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">Mark Completed</button>`;
      btn = `<div style="display:flex;gap:4px">${startBtn}${completeBtn}</div>`;
    } else {
      btn = `<span style="color:var(--dash-muted);font-size:12px">${r.workerStatus||'N/A'}</span>`;
    }

    return `<tr><td>${String(i+1).padStart(2,'0')}</td><td>${_escapeHtml(r.location||"--")}</td><td>${_escapeHtml(r.wasteCategory||"General")}</td><td><span class="status-pill ${_getStatusTone(r.status)}">${_escapeHtml(r.status||"Pending")}</span></td><td>${btn}</td></tr>`;
  }).join("");
};

let workerMapInstance = null, workerMapMarker = null;

const loadWorkerDashboard = async () => {
  if (dashboardRole !== "worker") return;
  const token = _getStoredToken();
  if (!token) return window.location.replace("/login/worker");
  try {
    const response = await fetch(`${_API}/api/worker/tasks`, { headers: { Authorization: `Bearer ${token}` } });
    if (handleUnauth(response)) return;
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Failed to load tasks");
    renderWorkerRequests(data);
    await loadWorkerLeaderboard(token);

    const mapContainer = document.getElementById("worker-map");
    const activeTask = data.find(t => t.workerStatus !== "Completed" && t.workerStatus !== "Rejected");
    if (mapContainer && activeTask) {
      const loc = activeTask.address || activeTask.location;
      if (loc) {
        document.getElementById("map-status").textContent = `Routing to: ${loc}`;
        try {
          const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(loc)}`);
          const geoData = await geoRes.json();
          if (geoData?.length > 0) {
            const lat = parseFloat(geoData[0].lat), lon = parseFloat(geoData[0].lon);
            if (!workerMapInstance) {
              workerMapInstance = L.map('worker-map').setView([lat,lon],14);
              L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(workerMapInstance);
            } else workerMapInstance.setView([lat,lon],14);
            if (workerMapMarker) workerMapMarker.setLatLng([lat,lon]); else workerMapMarker = L.marker([lat,lon]).addTo(workerMapInstance);
            workerMapMarker.bindPopup(`<b>Target</b><br>${loc}`).openPopup();
            setTimeout(() => workerMapInstance.invalidateSize(), 500);
          } else document.getElementById("map-status").textContent = "Could not find coordinates.";
        } catch (e) { console.error("Geocoding failed", e); }
      } else document.getElementById("map-status").textContent = "No address provided.";
    } else if (mapContainer) document.getElementById("map-status").textContent = "No active tasks.";

    // Update summary metrics
    const total = data.length, completed = data.filter(r=>r.workerStatus==="Completed").length;
    const perf = total === 0 ? 100 : Math.round((completed/total)*100);
    const el = (id) => document.getElementById(id);
    if(el("worker-metric-assigned")) el("worker-metric-assigned").textContent = total;
    if(el("worker-metric-completed")) el("worker-metric-completed").textContent = completed;
    if(el("worker-metric-performance")) el("worker-metric-performance").textContent = `${perf}%`;
    if(el("worker-metric-assigned-bar")) el("worker-metric-assigned-bar").style.width = "100%";
    if(el("worker-metric-completed-bar")) el("worker-metric-completed-bar").style.width = `${total===0?0:(completed/total)*100}%`;
    if(el("worker-metric-performance-bar")) el("worker-metric-performance-bar").style.width = `${perf}%`;
  } catch (error) { console.error(error); }
};

const loadWorkerLeaderboard = async (token) => {
  const body = document.getElementById("worker-leaderboard-body");
  if (!body) return;
  try {
    const res = await fetch(`${_API}/api/worker/leaderboard`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error("Failed");
    const top = await res.json();
    body.innerHTML = top.map((w,i) => `<tr><td>#${i+1}</td><td><strong>${_escapeHtml(w.name)}</strong></td><td><span class="status-pill green">${w.completedTasks||0}</span></td></tr>`).join("");
  } catch { body.innerHTML = `<tr><td colspan="3">Could not load</td></tr>`; }
};

// ══════════════════════════════════════
// ADMIN DASHBOARD
// ══════════════════════════════════════

const loadAdminDashboard = async () => {
  if (dashboardRole !== "admin") return;
  const token = _getStoredToken();
  if (!token) return window.location.replace("/login/admin");

  try {
    // Use the stats endpoint for metric cards
    const [statsRes, workersRes] = await Promise.all([
      fetch(`${_API}/api/admin/stats`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${_API}/api/admin/workers`, { headers: { Authorization: `Bearer ${token}` } })
    ]);

    if (handleUnauth(statsRes)) return;
    const stats = await statsRes.json();
    const workersData = await workersRes.json();

    if (!statsRes.ok) throw new Error(stats.message || "Failed to load stats");

    // Update metric cards
    const el = (id) => document.getElementById(id);
    if(el("admin-total-requests-count")) el("admin-total-requests-count").textContent = stats.totalRequests || 0;
    if(el("admin-pending-requests-count")) el("admin-pending-requests-count").textContent = stats.pendingRequests || 0;
    if(el("admin-in-progress-requests-count")) el("admin-in-progress-requests-count").textContent = stats.inProgressRequests || 0;
    if(el("admin-completed-requests-count")) el("admin-completed-requests-count").textContent = stats.completedRequests || 0;
    if(el("admin-total-users-count")) el("admin-total-users-count").textContent = stats.totalUsers || 0;
    if(el("admin-total-workers-count")) el("admin-total-workers-count").textContent = stats.totalWorkers || 0;
    if(el("admin-available-workers-count")) el("admin-available-workers-count").textContent = stats.availableWorkers || 0;
    if(el("admin-cancelled-requests-count")) el("admin-cancelled-requests-count").textContent = stats.cancelledRequests || 0;

    // Dynamic metric bars
    const total = Math.max(stats.totalRequests || 1, 1);
    const setBar = (id, pct) => { const b = el(id); if(b) setTimeout(()=> b.style.width = `${pct}%`, 100); };
    setBar("bar-total", 100);
    setBar("bar-pending", (stats.pendingRequests / total) * 100);
    setBar("bar-progress", (stats.inProgressRequests / total) * 100);
    setBar("bar-completed", (stats.completedRequests / total) * 100);
    setBar("bar-users", Math.min(100, (stats.totalUsers / Math.max(stats.totalUsers, 10)) * 100));
    setBar("bar-workers", Math.min(100, (stats.totalWorkers / Math.max(stats.totalWorkers, 5)) * 100));
    setBar("bar-available", stats.totalWorkers ? (stats.availableWorkers / stats.totalWorkers) * 100 : 0);
    setBar("bar-cancelled", (stats.cancelledRequests || 0) / total * 100);

    // Workers table (top 5 preview)
    const workersTbody = el("admin-workers-table-body");
    if (workersTbody) {
      const workers = Array.isArray(workersData) ? workersData : [];
      if (workers.length === 0) {
        workersTbody.innerHTML = `<tr><td colspan="4">No verified workers found.</td></tr>`;
      } else {
        workersTbody.innerHTML = workers.slice(0, 5).map(w => {
          const tone = w.availability === "Available" ? "green" : w.availability === "Busy" ? "orange" : "red";
          return `<tr>
            <td><strong>${_escapeHtml(w.name)}</strong><br><small style="color:var(--dash-muted)">${_escapeHtml(w.email)}</small></td>
            <td><span class="status-pill ${tone}">${_escapeHtml(w.availability||"Offline")}</span></td>
            <td>${w.activeTasks || 0}</td>
            <td><strong>${w.completedTasks || 0}</strong></td>
          </tr>`;
        }).join("");
      }
    }

    await loadAdminLeaderboards(token);
  } catch (error) {
    _showToast(error.message, "error");
  }
};

const loadAdminLeaderboards = async (token) => {
  const topWorkersBody = document.getElementById("admin-top-workers-body");
  const topUsersBody = document.getElementById("admin-top-users-body");
  if (!topWorkersBody || !topUsersBody) return;
  try {
    const res = await fetch(`${_API}/api/admin/leaderboards`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error("Failed");
    const { topUsers, topWorkers } = await res.json();
    topWorkersBody.innerHTML = topWorkers.map(w => `<tr><td><strong>${_escapeHtml(w.name)}</strong></td><td><span class="status-pill green">${w.completedTasks||0} pickups</span></td></tr>`).join("") || `<tr><td colspan="2">No workers</td></tr>`;
    topUsersBody.innerHTML = topUsers.map(u => `<tr><td><strong>${_escapeHtml(u.name)}</strong></td><td><span class="status-pill green">${u.points||0} pts</span></td></tr>`).join("") || `<tr><td colspan="2">No users</td></tr>`;
  } catch {
    topWorkersBody.innerHTML = `<tr><td colspan="2">Error loading</td></tr>`;
    topUsersBody.innerHTML = `<tr><td colspan="2">Error loading</td></tr>`;
  }
};

// ─── Create Worker Form (admin dashboard) ───
const createWorkerForm = document.getElementById("create-worker-form");
if (createWorkerForm) {
  createWorkerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById("worker-form-status");
    const name = document.getElementById("worker-name").value;
    const email = document.getElementById("worker-email").value;
    const password = document.getElementById("worker-password").value;

    if (password.length < 6) {
      if(statusEl){statusEl.textContent="Password must be at least 6 characters";statusEl.className="form-status error";}
      return;
    }

    const ok = typeof _showConfirm === "function" ? await _showConfirm("Create Worker", `Create worker "${name}" (${email})?`, "Create", "primary") : confirm(`Create worker "${name}"?`);
    if (!ok) return;

    const token = _getStoredToken();
    try {
      if(statusEl){statusEl.textContent="Creating...";statusEl.className="form-status";}
      const res = await fetch(`${_API}/api/admin/workers`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed");
      _showToast("Worker created successfully!", "success");
      if(statusEl){statusEl.textContent="Worker created!";statusEl.className="form-status success";}
      createWorkerForm.reset();
      loadAdminDashboard();
    } catch (err) {
      _showToast(err.message, "error");
      if(statusEl){statusEl.textContent=err.message;statusEl.className="form-status error";}
    }
  });
}

// ─── New Request Form (user dashboard) ───
if (newRequestForm) {
  newRequestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const token = _getStoredToken();
    if (!token) { setNewRequestStatus("Please log in again.", "error"); window.location.replace("/login/user"); return; }
    const formData = new FormData(newRequestForm);
    const payload = {
      description: String(formData.get("description") || "").trim(),
      location: String(formData.get("location") || "").trim(),
      imageUrl: String(formData.get("imageUrl") || "").trim()
    };
    if (!payload.description || !payload.location) { setNewRequestStatus("Description and location are required.", "error"); return; }
    try {
      setNewRequestStatus("Submitting...");
      const response = await fetch(`${_API}/api/requests`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (handleUnauth(response)) return;
      if (!response.ok) throw new Error(data.msg || data.message || "Unable to submit");
      newRequestForm.reset();
      setNewRequestStatus("Request submitted successfully.", "success");
      await loadUserRequests();
    } catch (error) { setNewRequestStatus(error.message, "error"); }
  });
}

// ─── Logout ───
if (logoutButton) {
  logoutButton.addEventListener("click", () => { _clearSession(); window.location.replace(`/login/${dashboardRole || "user"}`); });
}

// ─── Init ───
loadUserRequests();
loadAdminDashboard();
loadWorkerDashboard();
