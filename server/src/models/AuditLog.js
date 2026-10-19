import mongoose from 'mongoose';

const changeSchema = new mongoose.Schema(
  {
    field: { type: String, required: true },
    from: { type: mongoose.Schema.Types.Mixed },
    to: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

/**
 * Append-only audit record. The API exposes NO update or delete endpoints for
 * audit logs, and reads are restricted to Admins — records cannot be modified
 * or removed through the application.
 */
const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true, index: true }, // e.g. shipment.status_changed
    category: { type: String, required: true, index: true }, // shipment | exception | user | ai | auth
    actor: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: { type: String, required: true },
      role: { type: String, required: true },
      email: { type: String },
    },
    entity: {
      kind: { type: String, required: true }, // Shipment | Exception | User | AIPlan
      id: { type: mongoose.Schema.Types.ObjectId },
      ref: { type: String, index: true }, // trackingId / exceptionId / email
    },
    summary: { type: String, required: true },
    changes: [changeSchema],
    meta: { type: mongoose.Schema.Types.Mixed },
    at: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false, versionKey: false }
);

export default mongoose.model('AuditLog', auditLogSchema);
