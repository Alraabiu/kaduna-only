require("dotenv").config();

const mongoose = require("mongoose");
const fs = require("fs");
const Trip = require("./models/Trip");

const ids = [
  "6a8a3840534ab25a07bb632d",
  "6a8a216aee4b826ebca614a4"
];

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const trips = await Trip.find({
      _id: { $in: ids }
    }).lean();

    fs.writeFileSync(
      "test-trip-backup.json",
      JSON.stringify(trips, null, 2)
    );

    console.log("Backup created successfully.");
    console.log("Trips backed up:", trips.length);

    trips.forEach(trip => {
      console.log(
        trip.tripId,
        "| Fare:", trip.fare,
        "| Status:", trip.status
      );
    });
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

run();
