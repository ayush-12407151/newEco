const User = require("../models/user");
const Request = require("../models/request");
const WorkerProfile = require("../models/workerProfile");
const { sendNotificationEmail, sendVerificationEmail } = require("../utils/emailService");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

const getDashboardStats = async (req, res) => {
  try {
    const [totalUsers, totalWorkers, totalRequests, pendingRequests, inProgressRequests, completedRequests, cancelledRequests, availableWorkers, busyWorkers] = await Promise.all([
      User.countDocuments({ role: "user" }),
      User.countDocuments({ role: "worker" }),
      Request.countDocuments(),
      Request.countDocuments({ status: "Pending" }),
      Request.countDocuments({ status: "In Progress" }),
      Request.countDocuments({ status: "Completed" }),
      Request.countDocuments({ status: "Cancelled" }),
      WorkerProfile.countDocuments({ availability: "Available" }),
      WorkerProfile.countDocuments({ availability: "Busy" })
    ]);

    res.json({
      totalUsers,
      totalWorkers,
      availableWorkers,
      busyWorkers,
      totalRequests,
      pendingRequests,
      inProgressRequests,
      completedRequests,
      cancelledRequests
    });
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
};

const getAllWorkers = async (req, res) => {
  try {
    // Use aggregation to avoid N+1 queries
    const workers = await User.find({ role: "worker", isVerified: true })
      .select("-password -verificationToken")
      .lean();

    const workerIds = workers.map(w => w._id);

    // Batch query: count completed tasks per worker
    const completedTaskCounts = await Request.aggregate([
      { $match: { assignedWorker: { $in: workerIds }, workerStatus: "Completed" } },
      { $group: { _id: "$assignedWorker", count: { $sum: 1 } } }
    ]);
    const completedMap = {};
    completedTaskCounts.forEach(item => {
      completedMap[item._id.toString()] = item.count;
    });

    // Batch query: count active tasks per worker
    const activeTaskCounts = await Request.aggregate([
      { $match: { assignedWorker: { $in: workerIds }, status: { $in: ["Pending", "In Progress"] } } },
      { $group: { _id: "$assignedWorker", count: { $sum: 1 } } }
    ]);
    const activeMap = {};
    activeTaskCounts.forEach(item => {
      activeMap[item._id.toString()] = item.count;
    });

    // Batch query: get all worker profiles
    const profiles = await WorkerProfile.find({ userId: { $in: workerIds } }).lean();
    const profileMap = {};
    profiles.forEach(p => {
      profileMap[p.userId.toString()] = p;
    });

    const workersWithPerformance = workers.map(worker => {
      const wid = worker._id.toString();
      const profile = profileMap[wid];
      return {
        ...worker,
        completedTasks: completedMap[wid] || 0,
        activeTasks: activeMap[wid] || 0,
        availability: profile ? profile.availability : "Offline",
        averageRating: profile ? profile.averageRating : 0,
        totalRatings: profile ? profile.totalRatings : 0
      };
    });

    res.json(workersWithPerformance);
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
};

const assignWorker = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { workerId } = req.body;

    const request = await Request.findById(requestId);
    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    const worker = await User.findOne({ _id: workerId, role: "worker" });
    if (!worker) {
      return res.status(404).json({ message: "Worker not found" });
    }
    if (!worker.isVerified) {
      return res.status(403).json({ message: "Cannot assign task. Worker is not verified." });
    }

    // Check worker availability
    const workerProfile = await WorkerProfile.findOne({ userId: worker._id });
    if (workerProfile && workerProfile.availability === "Offline") {
      return res.status(400).json({ message: "Cannot assign task. Worker is currently offline." });
    }

    request.assignedWorker = worker._id;
    request.status = "In Progress";
    request.workerStatus = "Assigned";
    await request.save();

    // Update worker profile
    if (workerProfile) {
      workerProfile.currentTaskCount += 1;
      await workerProfile.save();
    }

    const io = req.app.get("io");
    if (io) {
      io.emit("notification", { message: `You have been assigned a new pickup task in ${request.location || 'your area'}.`, userId: worker._id });
      io.emit("notification", { message: `A worker has been assigned to your request!`, userId: request.userId });
      io.emit("admin-update", { type: "assignment", requestId: request._id });
    }

    const user = await User.findById(request.userId);
    if (user && user.email) {
      await sendNotificationEmail(user.email, "Worker Assigned", `Great news! A worker (${worker.name}) has been assigned to your request at ${request.location}. They will arrive soon.`);
    }
    if (worker && worker.email) {
      const emailHtml = `
        <h3>New Pickup Task Assigned</h3>
        <p>You have been assigned a new task. Please review the details below:</p>
        <ul>
          <li><strong>Location:</strong> ${request.location || 'N/A'}</li>
          <li><strong>Address:</strong> ${request.address || 'N/A'}</li>
          <li><strong>Category:</strong> ${request.wasteCategory || 'General'}</li>
          <li><strong>Pickup Type:</strong> ${request.pickupType || 'home'}</li>
          <li><strong>Description:</strong> ${request.description || 'No description provided'}</li>
        </ul>
        <p>Please log in to your dashboard to view the map and start the task.</p>
      `;
      await sendNotificationEmail(worker.email, "New Task Assigned", emailHtml);
    }

    res.json({ message: "Worker assigned successfully", request });
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({ role: "user" }).select("-password -verificationToken -verificationTokenExpiry").lean();

    // Get request counts per user
    const userIds = users.map(u => u._id);
    const requestCounts = await Request.aggregate([
      { $match: { userId: { $in: userIds } } },
      { $group: { _id: "$userId", total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ["$status", "Completed"] }, 1, 0] } } } }
    ]);
    const requestMap = {};
    requestCounts.forEach(item => {
      requestMap[item._id.toString()] = { total: item.total, completed: item.completed };
    });

    const usersWithStats = users.map(user => ({
      ...user,
      totalRequests: requestMap[user._id.toString()]?.total || 0,
      completedRequests: requestMap[user._id.toString()]?.completed || 0
    }));

    res.json(usersWithStats);
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
};

const createWorker = async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters" });
  }

  try {
    const normalizedEmail = email.toLowerCase();
    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      return res.status(409).json({ message: "Email is already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const newWorker = await User.create({
      name,
      email: normalizedEmail,
      password: hashedPassword,
      role: "worker",
      isVerified: false, // Worker must verify their email
      verificationToken,
      verificationTokenExpiry
    });

    // Create the worker profile since they were just added by the admin
    await WorkerProfile.create({ 
      userId: newWorker._id,
      availability: "Available" 
    });

    try {
      await sendVerificationEmail(newWorker.email, verificationToken);
    } catch (emailError) {
      console.error("Failed to send worker verification email:", emailError);
    }

    const io = req.app.get("io");
    if (io) {
      io.emit("admin-update", { type: "worker-created", workerId: newWorker._id });
    }

    res.status(201).json({
      message: "Worker created successfully. Verification email sent.",
      worker: {
        id: newWorker._id,
        name: newWorker.name,
        email: newWorker.email
      }
    });

  } catch (e) {
    console.error("Create Worker Error:", e);
    res.status(500).json({ message: "Server error" });
  }
};

const getAdminLeaderboards = async (req, res) => {
  try {
    const topUsers = await User.find({ role: "user" }).select("name points email").sort({ points: -1 }).limit(5);
    
    // Use aggregation for workers instead of N+1 queries
    const allWorkers = await User.find({ role: "worker", isVerified: true }).select("name email").lean();
    const workerIds = allWorkers.map(w => w._id);

    const completedCounts = await Request.aggregate([
      { $match: { assignedWorker: { $in: workerIds }, workerStatus: "Completed" } },
      { $group: { _id: "$assignedWorker", count: { $sum: 1 } } }
    ]);
    const countMap = {};
    completedCounts.forEach(item => {
      countMap[item._id.toString()] = item.count;
    });

    const workersWithPerformance = allWorkers.map(worker => ({
      ...worker,
      completedTasks: countMap[worker._id.toString()] || 0
    }));

    const topWorkers = workersWithPerformance.sort((a, b) => b.completedTasks - a.completedTasks).slice(0, 5);

    res.json({ topUsers, topWorkers });
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
};

const getRequestDetail = async (req, res) => {
  try {
    const { requestId } = req.params;
    const request = await Request.findById(requestId)
      .populate("userId", "name email points")
      .populate("assignedWorker", "name email")
      .lean();

    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    // If worker is assigned, get their profile data
    let workerProfile = null;
    if (request.assignedWorker) {
      workerProfile = await WorkerProfile.findOne({ userId: request.assignedWorker._id }).lean();
    }

    res.json({ request, workerProfile });
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
};

const deleteRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const request = await Request.findById(requestId);
    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    await Request.findByIdAndDelete(requestId);

    const io = req.app.get("io");
    if (io) {
      io.emit("admin-update", { type: "request-deleted", requestId });
    }

    res.json({ message: "Request deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
};

const deleteWorker = async (req, res) => {
  try {
    const { workerId } = req.params;
    const worker = await User.findOne({ _id: workerId, role: "worker" });
    if (!worker) {
      return res.status(404).json({ message: "Worker not found" });
    }

    // Unassign from any pending/in-progress requests
    await Request.updateMany(
      { assignedWorker: workerId, status: { $in: ["Pending", "In Progress"] } },
      { $set: { assignedWorker: null, status: "Pending", workerStatus: null } }
    );

    // Delete worker profile
    await WorkerProfile.findOneAndDelete({ userId: workerId });

    // Delete worker user
    await User.findByIdAndDelete(workerId);

    const io = req.app.get("io");
    if (io) {
      io.emit("admin-update", { type: "worker-deleted", workerId });
    }

    res.json({ message: "Worker deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findOne({ _id: userId, role: "user" });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Don't delete requests — keep them for records, just remove user
    await User.findByIdAndDelete(userId);

    const io = req.app.get("io");
    if (io) {
      io.emit("admin-update", { type: "user-deleted", userId });
    }

    res.json({ message: "User deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
};

const cancelRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const request = await Request.findById(requestId);
    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    if (request.status === "Completed") {
      return res.status(400).json({ message: "Cannot cancel a completed request" });
    }

    // If worker was assigned, unassign and update profile
    if (request.assignedWorker) {
      const workerProfile = await WorkerProfile.findOne({ userId: request.assignedWorker });
      if (workerProfile && workerProfile.currentTaskCount > 0) {
        workerProfile.currentTaskCount -= 1;
        await workerProfile.save();
      }
    }

    request.status = "Cancelled";
    request.assignedWorker = null;
    request.workerStatus = null;
    await request.save();

    const io = req.app.get("io");
    if (io) {
      io.emit("notification", { message: `Your request has been cancelled by the admin.`, userId: request.userId });
      io.emit("admin-update", { type: "request-cancelled", requestId });
    }

    res.json({ message: "Request cancelled successfully", request });
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
};

module.exports = {
  getDashboardStats,
  getAllWorkers,
  assignWorker,
  getAllUsers,
  createWorker,
  getAdminLeaderboards,
  getRequestDetail,
  deleteRequest,
  deleteWorker,
  deleteUser,
  cancelRequest
};
