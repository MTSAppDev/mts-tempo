import 'dotenv/config';
import mongoose from 'mongoose';
import { bootstrapAdmin } from './bootstrap.js';
// Read credentials from stdin, never command-line arguments or committed files.
let input = ''; for await (const chunk of process.stdin) input += chunk;
const body = JSON.parse(input);
try {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  console.log(JSON.stringify(await bootstrapAdmin(body)));
} finally { await mongoose.disconnect(); }
