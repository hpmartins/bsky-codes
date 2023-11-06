import { connect } from "mongoose";
import 'dotenv/config';

export * from './schema';

export async function connectDb() {
  await connect(process.env.MONGODB_URI ?? "")
}
