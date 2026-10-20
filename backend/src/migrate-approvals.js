import 'dotenv/config';
import mongoose from 'mongoose';
import { Timesheet, User } from './models.js';
import { approvalSnapshot } from './approvals.js';
// One-off, idempotent: gives every currently Approved sheet without a snapshot an approval revision built from its
// current (still approved) entries. Approvals overwritten by an earlier reopen cannot be recovered and are only counted.
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
try {
  await Promise.all(Object.values(mongoose.models).map(m => m.init()));
  let migrated = 0, skipped = 0;
  for await (const sheet of Timesheet.find({ status: 'Approved', 'lastApproved.revision': { $exists: false } }).cursor()) {
    try {
      const approver = await User.findById(sheet.reviewedBy || sheet.user).select('name');
      const snapshot = await approvalSnapshot(sheet, approver || { _id: sheet.reviewedBy || sheet.user, name: 'Unknown approver' }, { approvedAt: sheet.reviewedAt || sheet.updatedAt, migrated: true });
      sheet.approvals.push(snapshot); sheet.lastApproved = snapshot;
      sheet.history.push({ action: 'approval-snapshot-migrated', actor: approver?._id || sheet.user, revision: sheet.revision, detail: `Revision ${sheet.revision} snapshot created from the approved entries during migration` });
      await sheet.save(); migrated++;
    } catch (error) { skipped++; console.error(`Skipped timesheet ${sheet._id}: ${error.message}`); }
  }
  const lost = await Timesheet.countDocuments({ status: { $ne: 'Approved' }, 'history.action': 'approved', 'lastApproved.revision': { $exists: false } });
  console.log(JSON.stringify({ migrated, skipped, reopenedBeforeMigrationWithoutRecoverableApproval: lost }));
  if (skipped) process.exitCode = 1;
} finally { await mongoose.disconnect(); }
