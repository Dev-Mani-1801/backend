import mongoose from "mongoose";
import Deposit from "../models/Deposit.js";

const MONGO_URI = "mongodb+srv://growthdev1:Ji0LlqjCuFzlYP9s@cluster0.zgxt7d9.mongodb.net/fakeminingapp?retryWrites=true&w=majority";

await mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// update
await Deposit.updateOne(
  { _id: new mongoose.Types.ObjectId("68cbfe10e9e8b5ceaba6920c") },
  { $set: { amountNumeric: mongoose.Types.Decimal128.fromString("0.00017") } }
);

console.log("Update successful");
await mongoose.disconnect();