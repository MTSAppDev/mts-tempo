import mongoose from 'mongoose';
import { readFileSync, unlinkSync, existsSync } from 'node:fs';
export default async function teardown() {
  const file = new URL('../../frontend/.test-state/database.json', import.meta.url);
  if (!existsSync(file)) return;
  const { dbName } = JSON.parse(readFileSync(file, 'utf8'));
  if (!/^tempo_ui_test_\d+_\d+$/.test(dbName)) throw new Error('Unexpected test database name; refusing cleanup');
  try { await mongoose.connect(process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017', { dbName, serverSelectionTimeoutMS: 10000 }); await mongoose.connection.dropDatabase(); unlinkSync(file); }
  finally { await mongoose.disconnect(); }
}
