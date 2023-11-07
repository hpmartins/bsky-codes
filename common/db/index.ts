import mongoose from 'mongoose';
import 'dotenv/config';

export * from './schema';

export async function connectDb(uri?: string) {
  await mongoose.connect(uri ?? process.env.MONGODB_URI ?? 'mongodb://localhost');
}
