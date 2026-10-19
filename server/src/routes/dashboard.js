import express from 'express';
import Shipment, { SHIPMENT_STATUSES } from '../models/Shipment.js';
import ExceptionModel, { SEVERITIES, EXCEPTION_STATUSES } from '../models/Exception.js';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';

const router = express.Router();
router.use(protect);

const OPEN_STATES = ['Open', 'In Progress', 'Escalated'];

router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 6 * 864e5);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const [byStatusAgg, bySeverityAgg, byExcStatusAgg, deliveredOnTime, deliveredTotal] = await Promise.all([
      Shipment.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      ExceptionModel.aggregate([{ $group: { _id: '$severity', count: { $sum: 1 } } }]),
      ExceptionModel.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Shipment.countDocuments({ status: 'Delivered', $expr: { $lte: ['$updatedAt', '$expectedDeliveryDate'] } }),
      Shipment.countDocuments({ status: 'Delivered' }),
    ]);

    const toMap = (agg) => Object.fromEntries(agg.map((r) => [r._id, r.count]));
    const statusMap = toMap(byStatusAgg);
    const shipmentsByStatus = SHIPMENT_STATUSES.map((s) => ({ label: s, value: statusMap[s] || 0 }));
    const sevMap = toMap(bySeverityAgg);
    const exceptionsBySeverity = SEVERITIES.map((s) => ({ label: s, value: sevMap[s] || 0 }));
    const excStatusMap = toMap(byExcStatusAgg);
    const exceptionsByStatus = EXCEPTION_STATUSES.map((s) => ({ label: s, value: excStatusMap[s] || 0 }));

    const [delayedShipments, criticalHigh, criticalCrit, escalatedSenior, recentActivity, trendAgg, openExceptions, overdueCount] =
      await Promise.all([
        Shipment.find({
          status: { $nin: ['Delivered', 'Cancelled'] },
          $or: [{ status: 'Delayed' }, { expectedDeliveryDate: { $lt: now } }],
        })
          .select('trackingId origin destination status expectedDeliveryDate priority')
          .sort({ expectedDeliveryDate: 1 })
          .limit(6),
        ExceptionModel.find({ severity: 'High', status: { $in: OPEN_STATES } }).sort({ createdAt: -1 }).limit(6),
        ExceptionModel.find({ severity: 'Critical', status: { $in: OPEN_STATES } }).sort({ createdAt: -1 }).limit(6),
        ExceptionModel.countDocuments({ status: { $in: OPEN_STATES }, escalationLevel: { $gte: 2 } }),
        Shipment.aggregate([
          { $unwind: '$timeline' },
          { $sort: { 'timeline.at': -1 } },
          { $limit: 12 },
          { $project: { _id: 0, shipmentId: '$_id', trackingId: 1, event: '$timeline' } },
        ]),
        Shipment.aggregate([
          { $match: { createdAt: { $gte: sevenDaysAgo } } },
          { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        ]),
        ExceptionModel.countDocuments({ status: { $in: OPEN_STATES } }),
        Shipment.countDocuments({
          status: { $nin: ['Delivered', 'Cancelled'] },
          $or: [{ status: 'Delayed' }, { expectedDeliveryDate: { $lt: now } }],
        }),
      ]);

    const criticalExceptions = [...criticalCrit, ...criticalHigh].slice(0, 6);
    const trendMap = toMap(trendAgg);
    const trend = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 864e5);
      const key = d.toISOString().slice(0, 10);
      trend.push({ label: key.slice(5), value: trendMap[key] || 0 });
    }

    const total = Shipments_total(statusMap);
    res.json({
      totals: {
        shipments: total,
        inTransit: (statusMap['In Transit'] || 0) + (statusMap['Out for Delivery'] || 0) + (statusMap['Picked Up'] || 0),
        delivered: statusMap['Delivered'] || 0,
        delayedOrOverdue: overdueCount,
        openExceptions,
        criticalExceptions: criticalExceptions.length,
        escalatedSenior,
      },
      onTimeRate: deliveredTotal ? Math.round((deliveredOnTime / deliveredTotal) * 100) : null,
      shipmentsByStatus,
      exceptionsBySeverity,
      exceptionsByStatus,
      shipmentsTrend: trend,
      delayedShipments,
      criticalExceptions,
      recentActivity,
    });

    function Shipments_total(map) {
      return Object.values(map).reduce((a, b) => a + b, 0);
    }
  })
);

export default router;
