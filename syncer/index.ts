import 'module-alias/register';
import 'dotenv/config';
import Bottleneck from 'bottleneck';
import { connectDb } from '../common/db';
import { runSync } from './sync';

export type AppContext = {
  limiter: Bottleneck;
  log: (text: string) => void;
};

async function run() {
  await connectDb();

  const limiter = new Bottleneck({
    maxConcurrent: 10,
    minTime: (5 * 60000) / 5000
  });
  const log = (text: string) => {
    console.log(`[${new Date().toLocaleTimeString()}] [syncer] ${text}`);
  };

  limiter.on('failed', async (error, jobInfo) => {
    console.log(error);
    console.log('Retrying in 10s...');
    return 10000;
  });
  limiter.on('retry', (error, jobInfo) => console.log('Retrying now'));

  const ctx: AppContext = {
    limiter,
    log,
  };

  await runSync(ctx);
}

run();
