import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function connectDB(mongoUri) {
  mongoose.set('strictQuery', true);
  if (mongoUri) {
    await mongoose.connect(mongoUri);
    console.log('[db] Connected to external MongoDB');
    return 'external';
  }
  // Embedded, real MongoDB server with a PERSISTENT data directory (wiredTiger on disk).
  // Stored under .cache/ so it is excluded from workspace snapshots (MongoDB journal
  // files are large), while keeping full runtime persistence. Data auto-reseeds if wiped.
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const dbPath = path.join(__dirname, '..', '.cache', 'db');
  fs.mkdirSync(dbPath, { recursive: true });
  const mongod = await MongoMemoryServer.create({
    instance: { dbPath, storageEngine: 'wiredTiger' },
  });
  await mongoose.connect(mongod.getUri('smartship'));
  console.log('[db] Embedded MongoDB started. Data dir:', dbPath);
  return 'embedded';
}
