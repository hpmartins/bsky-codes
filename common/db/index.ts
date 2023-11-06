import { connect } from "mongoose";
import 'dotenv/config';

export async function connectDb() {
  await connect(process.env.MONGODB_URI ?? "")
}
