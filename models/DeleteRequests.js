import mongoose from "mongoose";

const DeleteRequestSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'users',
    required: true
  },
  reason: {
    type: String,
    required: true
  },
}, { timestamps: true });

export default mongoose.model("DeleteRequest", DeleteRequestSchema);