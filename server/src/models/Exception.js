import mongoose from 'mongoose';

export const EXCEPTION_TYPES = [
  'Delivery Delay',
  'Vehicle Breakdown',
  'Missing Documents',
  'Unreachable Recipient',
  'Damaged Shipment',
  'Lost Shipment',
  'Weather / Natural Cause',
  'Other',
];

export const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];
export const EXCEPTION_STATUSES = ['Open', 'In Progress', 'Escalated', 'Resolved', 'Closed'];
export const ESCALATION_LEVELS = ['Dispatcher', 'Supervisor', 'Senior Management', 'External Partner'];

export const TEAMS = [
  'Dispatch Team',
  'Fleet & Maintenance',
  'Documentation Team',
  'Customer Support',
  'Operations',
  'External Carrier',
];

const escalationSchema = new mongoose.Schema(
  {
    fromLevel: { type: String, required: true },
    toLevel: { type: String, required: true },
    reason: { type: String, required: true },
    by: { type: String, required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: true }
);

const exceptionSchema = new mongoose.Schema(
  {
    exceptionId: { type: String, required: true, unique: true, index: true, uppercase: true },
    shipment: { type: mongoose.Schema.Types.ObjectId, ref: 'Shipment', required: true },
    trackingId: { type: String, required: true, index: true },
    type: { type: String, enum: EXCEPTION_TYPES, required: true },
    description: { type: String, required: true },
    severity: { type: String, enum: SEVERITIES, default: 'Medium', index: true },
    status: { type: String, enum: EXCEPTION_STATUSES, default: 'Open', index: true },
    assignedTeam: { type: String, default: 'Dispatch Team' },
    escalationLevel: { type: Number, min: 0, max: ESCALATION_LEVELS.length - 1, default: 0 },
    escalations: [escalationSchema],
    reportedBy: { type: String, required: true },
    aiPlan: { type: mongoose.Schema.Types.Mixed },
    resolution: {
      notes: String,
      by: String,
      at: Date,
    },
  },
  { timestamps: true }
);

export default mongoose.model('Exception', exceptionSchema);
