import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import User from './models/User.js';
import Shipment from './models/Shipment.js';
import ExceptionModel from './models/Exception.js';
import Notification from './models/Notification.js';
import { connectDB } from './db.js';
import { TEAM_BY_TYPE } from './services/recovery.js';

const now = Date.now();
const H = 36e5;
const D = 24 * H;
const ago = (h) => new Date(now - h * H);
const ahead = (h) => new Date(now + h * H);

const USERS = [
  { name: 'Aarav Sharma', email: 'admin@smartship.io', password: 'Admin@123', role: 'Admin' },
  { name: 'Diya Patil', email: 'dispatcher@smartship.io', password: 'Dispatch@123', role: 'Dispatcher' },
  { name: 'Rohan Deshmukh', email: 'ops@smartship.io', password: 'Ops@1234', role: 'Operations' },
  { name: 'Sneha Kulkarni', email: 'service@smartship.io', password: 'Service@123', role: 'Customer Service' },
  { name: 'Vikram Joshi', email: 'supervisor@smartship.io', password: 'Super@123', role: 'Supervisor' },
];

const CITIES = [
  ['Mumbai Hub', 'Delhi NCR Hub'],
  ['Pune DC', 'Bengaluru Hub'],
  ['Nanded Depot', 'Hyderabad Hub'],
  ['Nagpur Hub', 'Chennai DC'],
  ['Ahmedabad Hub', 'Jaipur DC'],
  ['Mumbai Hub', 'Nanded Depot'],
];

const PEOPLE = [
  ['Tata Electronics Ltd', 'Priya Nair'],
  ['Mahindra Auto Components', 'Kunal Mehta'],
  ['Reliance Retail WH-4', 'Ananya Iyer'],
  ['FreshFarms Agro', 'Suresh Pawar'],
  ['MedLife Pharma', 'Dr. Neha Kulkarni'],
  ['Vertex Textiles', 'Arjun Malhotra'],
  ['Orbit Electronics', 'Meera Reddy'],
  ['GreenLeaf Organics', 'Rahul Verma'],
];

function flowTimeline(status, creator, base = 'Created Hub') {
  const steps = ['Created', 'Picked Up', 'In Transit', 'Out for Delivery', 'Delivered'];
  const idx = steps.indexOf(status);
  const events = [{ type: 'created', message: `Shipment created by ${creator}`, status: 'Created', actor: creator, at: ago(idx * 26 + 4) }];
  let cursor = idx * 26 + 2;
  for (let i = 1; i <= Math.max(0, idx); i++) {
    events.push({
      type: 'status',
      message: `Status changed from "${steps[i - 1]}" to "${steps[i]}"`,
      status: steps[i],
      actor: creator,
      at: ago(cursor),
    });
    cursor -= 26;
  }
  if (!steps.includes(status) && status !== 'Created') {
    events.push({ type: 'status', message: `Status changed to "${status}"`, status, actor: creator, at: ago(6) });
  }
  return events.sort((a, b) => new Date(a.at) - new Date(b.at));
}

const CARRIERS_SEED = [
  { name: 'SmartShip Fleet', code: 'SSFT', service: 'Own fleet — line-haul' },
  { name: 'Delhivery', code: 'DELH', service: 'Express surface' },
  { name: 'BlueDart', code: 'BLDT', service: 'Air express' },
  { name: 'DTDC', code: 'DTDC', service: 'Standard surface' },
  { name: 'XpressBees', code: 'XPBE', service: 'Same-region express' },
];

const SHIPMENTS = [
  { t: 'SHP-MH101A', s: 0, p: 0, status: 'Delivered', eta: ago(30), pr: 'Express', w: 120, c: 2 },
  { t: 'SHP-MH102B', s: 1, p: 1, status: 'Delivered', eta: ago(55), pr: 'Standard', w: 48, c: 0 },
  { t: 'SHP-MH103C', s: 2, p: 2, status: 'Delivered', eta: ago(90), pr: 'Standard', w: 310, c: 1 },
  { t: 'SHP-MH104D', s: 3, p: 3, status: 'In Transit', eta: ahead(36), pr: 'Express', w: 75, c: 1 },
  { t: 'SHP-MH105E', s: 4, p: 4, status: 'In Transit', eta: ahead(60), pr: 'Critical', w: 22, c: 2 },
  { t: 'SHP-MH106F', s: 5, p: 5, status: 'In Transit', eta: ago(14), pr: 'Standard', w: 160, c: 3 }, // overdue
  { t: 'SHP-MH107G', s: 0, p: 6, status: 'Out for Delivery', eta: ahead(8), pr: 'Express', w: 12, c: 4 },
  { t: 'SHP-MH108H', s: 1, p: 7, status: 'Out for Delivery', eta: ahead(5), pr: 'Standard', w: 33, c: 0 },
  { t: 'SHP-MH109I', s: 2, p: 0, status: 'Delayed', eta: ago(26), pr: 'Critical', w: 540, c: 0 },
  { t: 'SHP-MH110J', s: 3, p: 1, status: 'Delayed', eta: ago(40), pr: 'Express', w: 88, c: 3 },
  { t: 'SHP-MH111K', s: 4, p: 2, status: 'On Hold', eta: ahead(20), pr: 'Standard', w: 200, c: 3 },
  { t: 'SHP-MH112L', s: 5, p: 3, status: 'On Hold', eta: ago(10), pr: 'Standard', w: 95, c: 1 }, // overdue+hold
  { t: 'SHP-MH113M', s: 0, p: 4, status: 'Picked Up', eta: ahead(72), pr: 'Standard', w: 410, c: 0 },
  { t: 'SHP-MH114N', s: 1, p: 5, status: 'Created', eta: ahead(96), pr: 'Express', w: 26, c: 2 },
  { t: 'SHP-MH115O', s: 2, p: 6, status: 'In Transit', eta: ahead(30), pr: 'Standard', w: 140, c: 4 },
  { t: 'SHP-MH116P', s: 3, p: 7, status: 'Cancelled', eta: ago(100), pr: 'Standard', w: 60, c: 3 },
];

const EXCEPTIONS = [
  { t: 'SHP-MH109I', ex: 'EXC-D90001', type: 'Vehicle Breakdown', sev: 'Critical', st: 'Escalated', lvl: 2,
    desc: 'Truck MH-12-4821 broke down on NH-61 near Ahmednagar; coolant failure. Replacement vehicle required urgently — shipment is Critical priority.', by: 'Diya Patil (Dispatcher)',
    esc: [
      ['Dispatcher', 'Supervisor', 'Replacement vehicle not available within 2-hour window; customer SLA at risk', 'Diya Patil (Dispatcher)', 5],
      ['Supervisor', 'Senior Management', 'Customer is a key account; needs approval for premium carrier hire', 'Vikram Joshi (Supervisor)', 2],
    ] },
  { t: 'SHP-MH109I', ex: 'EXC-D90002', type: 'Delivery Delay', sev: 'High', st: 'In Progress', lvl: 1,
    desc: 'Knock-on delay from breakdown; revised ETA pushes delivery 18+ hours past commitment.', by: 'Diya Patil (Dispatcher)',
    esc: [['Dispatcher', 'Supervisor', 'SLA breach imminent on Critical shipment', 'Diya Patil (Dispatcher)', 4]] },
  { t: 'SHP-MH110J', ex: 'EXC-D90003', type: 'Delivery Delay', sev: 'High', st: 'Open', lvl: 0,
    desc: 'Monsoon flooding on corridor near Vijayapura; vehicle held at safe bay. Express shipment now ~40h overdue.', by: 'Rohan Deshmukh (Operations)', esc: [] },
  { t: 'SHP-MH111K', ex: 'EXC-D90004', type: 'Missing Documents', sev: 'Medium', st: 'In Progress', lvl: 1,
    desc: 'E-way bill expired before checkpoint crossing; shipment held at Nagpur Hub until regenerated documents arrive.', by: 'Rohan Deshmukh (Operations)',
    esc: [['Dispatcher', 'Supervisor', 'Documentation team needs sender compliance escalation', 'Diya Patil (Dispatcher)', 12]] },
  { t: 'SHP-MH112L', ex: 'EXC-D90005', type: 'Damaged Shipment', sev: 'High', st: 'Escalated', lvl: 1,
    desc: 'Upon hub scan, 3 of 20 cartons show crush damage and moisture. Recipient notified; awaiting claim assessment before onward movement.', by: 'Sneha Kulkarni (Customer Service)',
    esc: [['Dispatcher', 'Supervisor', 'Damage claim value exceeds dispatcher authority', 'Diya Patil (Dispatcher)', 20]] },
  { t: 'SHP-MH106F', ex: 'EXC-D90006', type: 'Unreachable Recipient', sev: 'Medium', st: 'Open', lvl: 0,
    desc: 'Recipient phone unreachable across 3 attempts; address in Nanded old city requires landmark confirmation for last-mile.', by: 'Sneha Kulkarni (Customer Service)', esc: [] },
  { t: 'SHP-MH115O', ex: 'EXC-D90007', type: 'Weather / Natural Cause', sev: 'Low', st: 'Resolved', lvl: 0,
    desc: 'Cyclone warning on coastal corridor; proactively rerouted inland adding ~6h. No further impact.', by: 'Diya Patil (Dispatcher)', esc: [],
    res: ['Rerouted via NH-52; threat window passed without disruption', 'Rohan Deshmukh (Operations)', 18] },
  { t: 'SHP-MH113M', ex: 'EXC-D90008', type: 'Missing Documents', sev: 'Low', st: 'Resolved', lvl: 0,
    desc: 'Sender forgot to include packing list hard copy; soft copy accepted at origin after verification.', by: 'Rohan Deshmukh (Operations)', esc: [],
    res: ['Digital copy verified and attached to shipment record', 'Vikram Joshi (Supervisor)', 30] },
  { t: 'SHP-MH104D', ex: 'EXC-D90009', type: 'Other', sev: 'Medium', st: 'Open', lvl: 0,
    desc: 'Customer requested address change mid-transit (same city). Awaiting ops confirmation of feasibility before delivery leg.', by: 'Sneha Kulkarni (Customer Service)', esc: [] },
  { t: 'SHP-MH107G', ex: 'EXC-D90010', type: 'Other', sev: 'Low', st: 'Closed', lvl: 0,
    desc: 'Delivery slot preference updated; logged for last-mile planning, no action needed.', by: 'Sneha Kulkarni (Customer Service)', esc: [] },
];

export async function seedIfEmpty() {
  const userCount = await User.countDocuments();
  if (userCount > 0) return false;
  console.log('[seed] Empty database — seeding demo data...');

  const createdUsers = {};
  for (const u of USERS) {
    createdUsers[u.role] = await User.create({ ...u, password: await bcrypt.hash(u.password, 10) });
  }
  const admin = createdUsers['Admin'];

  const shipmentDocs = {};
  for (const row of SHIPMENTS) {
    const [origin, destination] = CITIES[row.s];
    const [senderName, recipientName] = [PEOPLE[row.s][0], PEOPLE[row.p][1]];
    const doc = await Shipment.create({
      trackingId: row.t,
      sender: { name: senderName, contact: '+91 98220 4' + String(1000 + row.s * 111).slice(1), address: `${origin}, Maharashtra` },
      recipient: { name: recipientName, contact: '+91 98220 7' + String(1000 + row.p * 137).slice(1), address: `${destination}` },
      origin,
      destination,
      expectedDeliveryDate: row.eta,
      status: row.status,
      priority: row.pr,
      weight: row.w,
      assignedTeam: row.pr === 'Critical' ? 'Operations' : 'Dispatch Team',
      currentLocation: ['In Transit', 'Out for Delivery', 'Delayed', 'On Hold'].includes(row.status) ? `${destination.split(' ')[0]} corridor` : origin,
      createdBy: admin._id,
      carrier: CARRIERS_SEED[row.c ?? 0],
      trackingSource: 'seed',
      timeline: flowTimeline(row.status, admin.name),
    });
    // Realistic timestamps: createdAt = first timeline event; delivered orders get
    // updatedAt relative to ETA so on-time rate is meaningful (2 on-time, 1 late).
    if (doc.timeline.length) {
      const firstAt = doc.timeline[0].at;
      const lastAt = doc.timeline[doc.timeline.length - 1].at;
      const patch = { createdAt: firstAt, updatedAt: lastAt, lastLocationUpdateAt: lastAt };
      if (row.status === 'Delivered') {
        patch.updatedAt = row.t === 'SHP-MH103C' ? new Date(row.eta.getTime() + 6 * H) : new Date(row.eta.getTime() - 4 * H);
      }
      await Shipment.updateOne({ _id: doc._id }, { $set: patch }, { timestamps: false });
    }
    shipmentDocs[row.t] = doc;
  }

  const excDocs = {};
  for (const e of EXCEPTIONS) {
    const ship = shipmentDocs[e.t];
    const exc = await ExceptionModel.create({
      exceptionId: e.ex,
      shipment: ship._id,
      trackingId: ship.trackingId,
      type: e.type,
      description: e.desc,
      severity: e.sev,
      status: e.st,
      assignedTeam: TEAM_BY_TYPE[e.type] || 'Operations',
      escalationLevel: e.lvl,
      escalations: e.esc.map(([fromLevel, toLevel, reason, by, hoursAgo]) => ({ fromLevel, toLevel, reason, by, at: ago(hoursAgo) })),
      reportedBy: e.by,
      resolution: e.res ? { notes: e.res[0], by: e.res[1], at: ago(e.res[2]) } : undefined,
    });
    ship.timeline.push({
      type: 'exception',
      message: `Exception ${exc.exceptionId} reported: ${e.type} (${e.sev} severity) — assigned to ${exc.assignedTeam}`,
      actor: e.by.split(' (')[0],
      at: ago(24),
      meta: { exceptionId: exc.exceptionId },
    });
    for (const [fromL, toL, reason, by, hAgo] of e.esc) {
      ship.timeline.push({ type: 'escalation', message: `Exception ${exc.exceptionId} escalated ${fromL} → ${toL}: ${reason}`, actor: by.split(' (')[0], at: ago(hAgo), meta: { exceptionId: exc.exceptionId } });
    }
    if (e.res) {
      ship.timeline.push({ type: 'resolution', message: `Exception ${exc.exceptionId} resolved: ${e.res[0]}`, actor: e.res[1].split(' (')[0], at: ago(e.res[2]), meta: { exceptionId: exc.exceptionId } });
    }
    await ship.save();
    excDocs[e.ex] = exc;
  }

  // Sample targeted notifications matching the seeded escalation history.
  const disp = createdUsers['Dispatcher'];
  const sup = createdUsers['Supervisor'];
  await Notification.insertMany([
    {
      type: 'escalation', severity: 'warning',
      title: 'Escalated to Supervisor: EXC-D90002',
      message: 'Diya Patil escalated Delivery Delay on SHP-MH109I (EXC-D90002, High). Reason: SLA breach imminent on Critical shipment',
      link: `/exceptions/${excDocs['EXC-D90002']._id}`, entity: { kind: 'Exception', id: excDocs['EXC-D90002']._id, ref: 'EXC-D90002' },
      targetRoles: ['Supervisor', 'Admin'],
      actor: { id: disp._id, name: disp.name, role: disp.role },
      createdAt: ago(4),
    },
    {
      type: 'escalation', severity: 'critical',
      title: 'Escalated to Senior Management: EXC-D90001',
      message: 'Vikram Joshi escalated Vehicle Breakdown on SHP-MH109I (EXC-D90001, Critical). Reason: Customer is a key account; needs approval for premium carrier hire',
      link: `/exceptions/${excDocs['EXC-D90001']._id}`, entity: { kind: 'Exception', id: excDocs['EXC-D90001']._id, ref: 'EXC-D90001' },
      targetRoles: ['Admin'],
      actor: { id: sup._id, name: sup.name, role: sup.role },
      createdAt: ago(2),
    },
    {
      type: 'exception', severity: 'warning',
      title: 'New high exception on SHP-MH112L',
      message: 'Sneha Kulkarni reported Damaged Shipment — EXC-D90005, assigned to Operations',
      link: `/exceptions/${excDocs['EXC-D90005']._id}`, entity: { kind: 'Exception', id: excDocs['EXC-D90005']._id, ref: 'EXC-D90005' },
      targetRoles: ['Operations', 'Supervisor', 'Admin'],
      actor: { id: createdUsers['Customer Service']._id, name: 'Sneha Kulkarni', role: 'Customer Service' },
      createdAt: ago(22),
    },
    {
      type: 'delay', severity: 'warning',
      title: 'SHP-MH110J marked delayed',
      message: 'Monsoon flooding on corridor near Vijayapura; vehicle held at safe bay.',
      link: `/shipments/${shipmentDocs['SHP-MH110J']._id}`, entity: { kind: 'Shipment', id: shipmentDocs['SHP-MH110J']._id, ref: 'SHP-MH110J' },
      targetRoles: ['Dispatcher', 'Operations', 'Supervisor', 'Customer Service'],
      actor: { id: createdUsers['Operations']._id, name: 'Rohan Deshmukh', role: 'Operations' },
      createdAt: ago(30),
    },
  ]);

  console.log(`[seed] Done: ${USERS.length} users, ${SHIPMENTS.length} shipments, ${EXCEPTIONS.length} exceptions, 4 notifications`);
  return true;
}

// Standalone execution: `npm run seed`
if (import.meta.url === `file://${process.argv[1]}`) {
  await connectDB(process.env.MONGODB_URI || '');
  await seedIfEmpty();
  await mongoose.disconnect();
  process.exit(0);
}
