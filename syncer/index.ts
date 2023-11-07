import 'dotenv/config';
import Bottleneck from 'bottleneck';
import { connectDb } from '../common/db';
import { runSync } from './sync';

const limiter = new Bottleneck({
  maxConcurrent: 10,
  minTime: (5 * 60000) / 5000
});

limiter.on('failed', async (error, jobInfo) => {
  console.log(error);
  console.log('Retrying in 10s...');
  return 10000;
});

limiter.on('retry', (error, jobInfo) => console.log('Retrying now'));

async function run() {
  await connectDb();
  await runSync(limiter);
}

run();
