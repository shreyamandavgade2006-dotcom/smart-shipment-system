import mongoose from 'mongoose';

/**
 * Persisted, role-targeted notification. Each notification is addressed to
 * one or more ROLES (targetRoles) and/or a specific user (targetUser).
 * An empty targetRoles array = visible to all roles (broadcast).
 * Read state is tracked per user in readBy.
 */
const notificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['escalation', 'exception', 'assignment', 'resolution', 'delay', 'status', 'user', 'system'],
      required: true,
    },
    severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'info' },
    title: { type: String, required: true },
    message: { type: String, required: true },
    link: { type: String }, // in-app route, e.g. /exceptions/<id>
    entity: {
      kind: String,
      id: { type: mongoose.Schema.Types.ObjectId },
      ref: String,
    },
    targetRoles: { type: [String], default: [], index: true },
    targetUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    actor: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: String,
      role: String,
    },
    readBy: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        at: { type: Date, default: Date.now },
        _id: false,
      },
    ],
    // External delivery attempts (webhook channel) with failure handling:
    // every notification records whether it was delivered, skipped or failed.
    delivery: [
      {
        channel: { type: String, required: true },
        status: { type: String, enum: ['delivered', 'failed', 'skipped'], required: true },
        attempts: { type: Number, default: 0 },
        lastError: { type: String },
        at: { type: Date, default: Date.now },
        _id: false,
      },
    ],
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

notificationSchema.index({ createdAt: -1 });

export default mongoose.model('Notification', notificationSchema);
