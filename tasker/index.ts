var cron = require('node-cron');
import 'module-alias/register';
import express from 'express';
import Bottleneck from 'bottleneck';
import { connectDb } from '../common/db';
import { BskyAgent } from '@atproto/api';
import { DidResolver } from '@atproto/identity';
import { maybeBoolean, maybeInt, maybeStr } from '../common';
import { syncBlockRecords, syncOneProfile, syncWaitingProfiles } from './tasks/sync';
import { storeBlocksHistogram, storeFollowsHistogram, storeLikesHistogram, storePostsHistogram, storeProfilesHistogram, storeRepostsHistogram, storeTopBlocked, storeTopPosters } from './tasks/stats';
import { updateLickablePeople, updateLickablePosts } from './tasks/wolfgang';
import { Manager } from "socket.io-client";
import redis, { createClient } from 'redis';
import dayjs from 'dayjs';

export const MINUTE = 60;
export const HOUR = MINUTE * 60;
export const DAY = HOUR * 24;
export const WEEK = DAY * 7;

type AppConfig = {
  bskyDid: string;
  bskyPwd: string;
  redisHost: string;
  redisPort: number;
}

export type AppContext = {
  cfg: AppConfig;
  app: express.Express;
  api: BskyAgent;
  didres: DidResolver;
  limiter: Bottleneck;
  cache: redis.RedisClientType<any, any, any>;
  log: (text: string) => void;
};

function scheduleTasks(ctx: AppContext) {
  cron.schedule('*/2 * * * *', async () => {
    await syncWaitingProfiles(ctx);
  });

  cron.schedule('0 */6 * * *', async () => {
    await storeTopBlocked();
  });

  cron.schedule('0 */6 * * *', async () => {
    await storeTopPosters();
  });

  cron.schedule('*/5 * * * *', async () => {
    const lickablePeople = await updateLickablePeople(ctx)
    await updateLickablePosts(ctx, lickablePeople)
  })

  cron.schedule('5 */2 * * *', async () => {
    const after = dayjs().subtract(2, 'day').startOf('day').toDate();
    await storeBlocksHistogram(after);
    await storeFollowsHistogram(after);
    await storeLikesHistogram(after);
    await storeProfilesHistogram(after);
    await storeRepostsHistogram(after);
    await storePostsHistogram(after);
  })
}

async function run() {
  await connectDb();

  const listenerHost = maybeStr(process.env.LISTENER_HOST) ?? 'localhost'
  const listenerPort = maybeInt(process.env.LISTENER_PORT) ?? 6002
  const manager = new Manager(`ws://${listenerHost}:${listenerPort}`);
  const socket = manager.socket('/');
  socket.on("connect", () => {
    log('connected to listener')
  })
  socket.io.on("reconnect", (attempt: number) => {
    log(`reconnected to listener [${attempt}]`)
  })
  socket.io.on("reconnect_attempt", (attempt: number) => {
    log(`reconnecting to listener... [${attempt}]`)
  })

  const cfg: AppConfig = {
    bskyDid: maybeStr(process.env.WOLFGANG_BSKY_DID) ?? '',
    bskyPwd: maybeStr(process.env.WOLFGANG_BSKY_PASSWORD) ?? '',
    redisHost: maybeStr(process.env.REDIS_HOST) ?? 'localhost',
    redisPort: maybeInt(process.env.REDIS_PORT) ?? 6379,
  }

  const app = express();
  const didres = new DidResolver({});
  const limiter = new Bottleneck({
    maxConcurrent: 1,
    minTime: (5 * 60000) / 2000
  });
  const log = (text: string) => {
    console.log(`[${new Date().toLocaleTimeString()}] [tasker] ${text}`);
  };

  const api = new BskyAgent({ service: 'https://bsky.social/' })
  await api.login({ identifier: cfg.bskyDid, password: cfg.bskyPwd });

  const cache = await createClient()
    .on('error', err => log(`redis error: ${err}`))
    .on('connect', () => log('connected to redis'))
    .connect()

  limiter.on('failed', async (error: Error, jobInfo) => {
    if (error.message.includes('Could not find repo')) {
      return;
    }
    ctx.log(error.message)
    ctx.log('Retrying in 10s...');
    return 10000;
  });

  const ctx: AppContext = {
    cfg,
    app,
    api,
    didres,
    limiter,
    cache,
    log,
  };

  if (!maybeBoolean(process.env.TASKER_DEVEL)) {
    log('starting tasks');
    scheduleTasks(ctx);
  }

  // Sync blocks
  socket.on("data", async (data: { repo: string }): Promise<void> => await syncBlockRecords(ctx, data.repo));

  app.get('/update/:did', async (req, res) => {
    const doc = await didres.resolveAtprotoData(req.params.did);
    if (!doc) return res.send('could not find did');
    try {
      await syncOneProfile(ctx, doc);
    } catch (e) {
      return res.send(e);
    }
    return res.send('done!');
  });

  const port = maybeInt(process.env.TASKER_PORT) ?? 6001;
  app.listen(port, () => {
    ctx.log(`listening @ :${port}`);
  });
}

run();
