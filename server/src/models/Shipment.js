import mongoose from 'mongoose';

export const SHIPMENT_STATUSES = [
  'Created',
  'Picked Up',
  'In Transit',
  'Out for Delivery',
  'Delivered',
  'Delayed',
  'On Hold',
  'Cancelled',
];

export const FLOW_STATUSES = ['Created', 'Picked Up', 'In Transit', 'Out for Delivery', 'Delivered'];

const timelineSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['created', 'status', 'exception', 'assignment', 'escalation', 'resolution', 'note', 'ai'],
      required: true,
    },
    message: { type: String, required: true },
    status: String,
    actor: String,
    meta: mongoose.Schema.Types.Mixed,
    at: { type: Date, default: Date.now },
  },
  { _id: true }
);

const partySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    contact: { type: String, trim: true },
    address: { type: String, trim: true },
  },
  { _id: false }
);

const shipmentSchema = new mongoose.Schema(
  {
    trackingId: { type: String, required: true, unique: true, index: true, uppercase: true, trim: true },
    sender: { type: partySchema, required: true },
    recipient: { type: partySchema, required: true },
    origin: { type: String, required: true, trim: true },
    destination: { type: String, required: true, trim: true },
    expectedDeliveryDate: { type: Date, required: true, index: true },
    status: { type: String, enum: SHIPMENT_STATUSES, default: 'Created', index: true },
    priority: { type: String, enum: ['Standard', 'Express', 'Critical'], default: 'Standard' },
    weight: { type: Number, min: 0 },
    notes: { type: String, trim: true },
    assignedTeam: { type: String, default: 'Dispatch Team' },
    currentLocation: { type: String, trim: true },
    carrier: {
      name: { type: String, trim: true, default: 'SmartShip Fleet' },
      code: { type: String, trim: true, default: 'SSFT', uppercase: true },
      service: { type: String, trim: true, default: 'Road — Standard' },
    },
    trackingSource: { type: String, enum: ['manual', 'webhook', 'seed'], default: 'manual' },
    lastLocationUpdateAt: { type: Date },
    timeline: [timelineSchema],
    lastAiPlan: { type: mongoose.Schema.Types.Mixed },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

shipmentSchema.virtual('isOverdue').get(function () {
  return (
    !['Delivered', 'Cancelled'].includes(this.status) &&
    this.expectedDeliveryDate &&
    this.expectedDeliveryDate < new Date()
  );
});

shipmentSchema.set('toJSON', { virtuals: true });
shipmentSchema.set('toObject', { virtuals: true });

export default mongoose.model('Shipment', shipmentSchema);
