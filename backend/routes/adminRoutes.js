const express = require("express");
const router = express.Router();
const {
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
} = require("../controllers/adminController");
const { auth } = require("../middleware/authMiddleware");
const { roleMiddleware } = require("../middleware/roleMiddleware");

router.use(auth);
router.use(roleMiddleware(["admin"]));

router.get("/stats", getDashboardStats);
router.get("/workers", getAllWorkers);
router.post("/workers", createWorker);
router.delete("/workers/:workerId", deleteWorker);
router.get("/users", getAllUsers);
router.delete("/users/:userId", deleteUser);
router.get("/requests/:requestId", getRequestDetail);
router.put("/requests/:requestId/assign", assignWorker);
router.put("/requests/:requestId/cancel", cancelRequest);
router.delete("/requests/:requestId", deleteRequest);
router.get("/leaderboards", getAdminLeaderboards);

module.exports = router;
