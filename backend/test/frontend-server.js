import mongoose from 'mongoose';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createApp } from '../src/app.js';
import { User } from '../src/models.js';
import { hashPassword } from '../src/security.js';
const dbName = `tempo_ui_test_${process.pid}_${Date.now()}`;
const uri = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017';
await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 10000 });
await Promise.all(Object.values(mongoose.models).map(model => model.init()));
const passwordHash = await hashPassword('Browser-test-password-42!');
await User.create([{ name: 'Test Admin', email: 'admin@tempo.test', role: 'Admin', active: true, passwordHash }, { name: 'Test Manager', email: 'manager@tempo.test', role: 'Manager', active: true, passwordHash }]);
mkdirSync(new URL('../../frontend/.test-state/', import.meta.url), { recursive: true });
writeFileSync(new URL('../../frontend/.test-state/database.json', import.meta.url), JSON.stringify({ dbName }));
process.env.CORS_ORIGINS = 'http://127.0.0.1:5175';
process.env.APP_URL = 'http://127.0.0.1:5175';
const server = createApp().listen(4005, '127.0.0.1', () => console.log('Isolated frontend test API ready'));
async function shutdown() { server.close(async () => { if (mongoose.connection.name === dbName && dbName.startsWith('tempo_ui_test_')) await mongoose.connection.dropDatabase(); await mongoose.disconnect(); process.exit(0); }); }
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
