var cron = require('node-cron');
import 'module-alias/register';
import express from 'express';
import Bottleneck from 'bottleneck';
import { connectDb } from '../common/db';
import { BskyAgent } from '@atproto/api';
import { DidResolver } from '@atproto/identity';
import { maybeBoolean, maybeInt } from '../common';
import { syncOneProfile, syncWaitingProfiles } from './tasks/sync';
import { storeTopBlocked, storeTopPosters } from './tasks/stats';
import { updateLickablePeople, updateLickablePosts } from './tasks/wolfgang';

type AppConfig = {
  bskyDid: string;
  bskyPwd: string;
}

export type AppContext = {
  cfg: AppConfig;
  app: express.Express;
  api: BskyAgent;
  didres: DidResolver;
  limiter: Bottleneck;
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
}

async function run() {
  await connectDb();

  const cfg = {
    bskyDid: process.env.WOLFGANG_BSKY_DID ?? '',
    bskyPwd: process.env.WOLFGANG_BSKY_PASSWORD ?? ''
  }

  const app = express();
  const didres = new DidResolver({});
  const limiter = new Bottleneck({
    maxConcurrent: 10,
    minTime: (5 * 60000) / 5000
  });
  const log = (text: string) => {
    console.log(`[${new Date().toLocaleTimeString()}] [tasker] ${text}`);
  };

  const api = new BskyAgent({ service: 'https://bsky.social/' })
  await api.login({ identifier: cfg.bskyDid, password: cfg.bskyPwd });

  limiter.on('failed', async (error, jobInfo) => {
    ctx.log(error);
    ctx.log('Retrying in 10s...');
    return 10000;
  });
  limiter.on('retry', (error, jobInfo) => ctx.log('Retrying now'));

  const ctx: AppContext = {
    cfg,
    app,
    api,
    didres,
    limiter,
    log,
  };

  if (!maybeBoolean(process.env.TASKER_DEVEL)) {
    log('starting tasks');
    scheduleTasks(ctx);
  }

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
