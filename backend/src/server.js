import 'dotenv/config';
import mongoose from 'mongoose';
import { createApp } from './app.js';
import { Timesheet } from './models.js';
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
await Promise.all(Object.values(mongoose.models).map(model => model.init()));
const unsnapshotted = await Timesheet.countDocuments({ status: 'Approved', 'lastApproved.revision': { $exists: false } });
if (unsnapshotted) console.warn(`${unsnapshotted} approved timesheet(s) have no approval snapshot and are missing from approved reports. Run: npm run migrate:approvals`);
const PORT = process.env.PORT || 4000;
const server = createApp().listen(PORT, '0.0.0.0', () => {
  console.log(`Tempo API listening on 0.0.0.0:${PORT}`);
});
async function close() { server.close(async () => { await mongoose.disconnect(); process.exit(0); }); }
process.on('SIGINT', close); process.on('SIGTERM', close);
