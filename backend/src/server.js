import 'dotenv/config';
import mongoose from 'mongoose';
import { createApp } from './app.js';
import { Timesheet } from './models.js';
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
await Promise.all(Object.values(mongoose.models).map(model => model.init()));
const unsnapshotted = await Timesheet.countDocuments({ status: 'Approved', 'lastApproved.revision': { $exists: false } });
if (unsnapshotted) console.warn(`${unsnapshotted} approved timesheet(s) have no approval snapshot and are missing from approved reports. Run: npm run migrate:approvals`);
const server = createApp().listen(process.env.PORT || 4000, '127.0.0.1', () => console.log(`Tempo API listening at http://127.0.0.1:${process.env.PORT || 4000}`));
async function close() { server.close(async () => { await mongoose.disconnect(); process.exit(0); }); }
process.on('SIGINT', close); process.on('SIGTERM', close);
