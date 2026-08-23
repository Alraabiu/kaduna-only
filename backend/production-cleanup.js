require("dotenv").config();

const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

const User = require("./models/User");
const Trip = require("./models/Trip");
const Wallet = require("./models/Wallet");
const Payment = require("./models/Payment");
const DriverProfile = require("./models/DriverProfile");

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const db = mongoose.connection.db;

  const backupDir = path.join(process.cwd(), "database-backup-before-production-cleanup");
  fs.mkdirSync(backupDir, { recursive: true });

  console.log("\n=== KADUNA ONLY DATABASE CLEANUP ===\n");

  // Find the Admin account that must be preserved.
  const admin = await User.findOne({
    email: "kadunaonly@gmail.com",
    role: "admin"
  }).select("+passwordHash");

  if (!admin) {
    throw new Error(
      "SAFETY STOP: Admin account kadunaonly@gmail.com was not found. Nothing has been deleted."
    );
  }

  console.log("Admin account preserved:");
  console.log("  Name:", admin.fullName);
  console.log("  Email:", admin.email);
  console.log("  Phone:", admin.phone);
  console.log("  Role:", admin.role);
  console.log("");

  // Backup important collections before deletion.
  const users = await User.find({}).lean();
  const trips = await Trip.find({}).lean();
  const wallets = await Wallet.find({}).lean();
  const payments = await Payment.find({}).lean();
  const drivers = await DriverProfile.find({}).lean();

  fs.writeFileSync(
    path.join(backupDir, "users.json"),
    JSON.stringify(users, null, 2)
  );

  fs.writeFileSync(
    path.join(backupDir, "trips.json"),
    JSON.stringify(trips, null, 2)
  );

  fs.writeFileSync(
    path.join(backupDir, "wallets.json"),
    JSON.stringify(wallets, null, 2)
  );

  fs.writeFileSync(
    path.join(backupDir, "payments.json"),
    JSON.stringify(payments, null, 2)
  );

  fs.writeFileSync(
    path.join(backupDir, "driver-profiles.json"),
    JSON.stringify(drivers, null, 2)
  );

  console.log("Backup created:");
  console.log(" ", backupDir);
  console.log("");

  // Delete operational test data.
  const tripResult = await Trip.deleteMany({});
  const paymentResult = await Payment.deleteMany({});
  const driverResult = await DriverProfile.deleteMany({});

  // Delete every wallet. A fresh wallet will be created for Admin below.
  const walletResult = await Wallet.deleteMany({});

  // Delete every user except the Admin account.
  const userResult = await User.deleteMany({
    _id: { $ne: admin._id }
  });

  // Re-create a clean Admin wallet.
  await Wallet.findOneAndUpdate(
    { user: admin._id },
    {
      $set: {
        user: admin._id,
        balance: 0,
        transactions: []
      }
    },
    {
      upsert: true,
      new: true
    }
  );

  console.log("=== CLEANUP COMPLETE ===");
  console.log("Trips deleted:", tripResult.deletedCount);
  console.log("Payments deleted:", paymentResult.deletedCount);
  console.log("Driver profiles deleted:", driverResult.deletedCount);
  console.log("Wallets reset:", walletResult.deletedCount);
  console.log("Non-admin users deleted:", userResult.deletedCount);
  console.log("");

  const remainingUsers = await User.find({}).select(
    "fullName email phone role status"
  );

  const remainingTrips = await Trip.countDocuments({});
  const remainingPayments = await Payment.countDocuments({});
  const remainingWallets = await Wallet.countDocuments({});

  console.log("=== FINAL DATABASE STATE ===");
  console.table(remainingUsers.map(u => ({
    name: u.fullName,
    email: u.email,
    phone: u.phone,
    role: u.role,
    status: u.status
  })));

  console.log("Trips remaining:", remainingTrips);
  console.log("Payments remaining:", remainingPayments);
  console.log("Wallets remaining:", remainingWallets);

  await mongoose.disconnect();
})().catch(async err => {
  console.error("\nCLEANUP FAILED:");
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
