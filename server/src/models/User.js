import mongoose from 'mongoose';

export const ROLES = ['Admin', 'Dispatcher', 'Operations', 'Customer Service', 'Supervisor'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, enum: ROLES, default: 'Dispatcher' },
  },
  { timestamps: true }
);

export default mongoose.model('User', userSchema);
