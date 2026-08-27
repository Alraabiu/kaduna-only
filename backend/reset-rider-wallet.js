require("dotenv").config();

const mongoose = require("mongoose");
const Wallet = require("./models/Wallet");

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const userId = "6a887c5ba291672cd936c623";

  const wallet = await Wallet.findOneAndUpdate(
    { user: userId },
    {
      $set: {
        balance: 0,
        transactions: []
      }
    },
    { returnDocument:'after' }
  );

  if (!wallet) {
    console.log("Wallet not found");
  } else {
    console.log("Wallet reset successfully");
    console.log("User:", String(wallet.user));
    console.log("Balance:", wallet.balance);
    console.log("Transactions:", wallet.transactions.length);
  }

  await mongoose.disconnect();
})().catch(err => {
  console.error(err);
  process.exit(1);
});