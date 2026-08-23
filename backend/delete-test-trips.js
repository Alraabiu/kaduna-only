require("dotenv").config();

const mongoose = require("mongoose");
const Trip = require("./models/Trip");

const ids = [
  "6a8a3840534ab25a07bb632d",
  "6a8a216aee4b826ebca614a4"
];

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const result = await Trip.deleteMany({
      _id: { $in: ids }
    });

    console.log("Deleted test trips:", result.deletedCount);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

run();
