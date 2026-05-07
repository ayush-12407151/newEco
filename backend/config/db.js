const mongoose = require("mongoose");

const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    console.warn("MongoDB connection skipped: MONGO_URI is not set in .env");
    return false;
  }

  try {
    await mongoose.connect(mongoUri);
    console.log("MongoDB Connected");
    return true;
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    return false;
  }
};

module.exports = connectDB;
