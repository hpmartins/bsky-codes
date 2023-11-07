var cron = require('node-cron');
import express from 'express';
import Bottleneck from 'bottleneck';
import { getProfile } from '../common/index';
import { Interaction, Profile, SyncProfile, connectDb } from '../common/db';
import { DidResolver } from '@atproto/identity';
import { syncRecords } from '../common/index';

// did resolver
const didres = new DidResolver({});

// Limiter
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

// Cron
cron.schedule('*/2 * * * *', async () => {
  await syncWaitingProfiles();
});

async function syncWaitingProfiles() {
  const list = await SyncProfile.find(
    {
      updated: false,
      status: null
    },
    {},
    { limit: 1 }
  ).sort({ updatedAt: 1 });
  for (const user of list) {
    await syncOneProfile(user._id);
  }
}

async function syncOneProfile(did: string) {
  const profile = await limiter.schedule(async () => getProfile(did));
  const doc = await didres.resolveAtprotoData(did);
  if (!profile || !doc) return false;

  await Profile.updateOne(
    { _id: profile.did },
    {
      handle: profile.handle,
      displayName: profile.displayName,
      avatar: profile.avatar,
      description: profile.description,
      indexedAt: profile.indexedAt,
      lastProfileUpdateAt: new Date()
    },
    { upsert: true }
  );

  console.log(`[sync] Updating data of @${profile.handle} [${profile.did}]`);

  const uptodate = new Date('2023-11-01');

  await Interaction.updateMany({ '_id.author': did }, { $pull: { list: { _id: { $lt: uptodate } } } });

  await syncRecords(doc, 'app.bsky.graph.block', undefined, limiter);
  await syncRecords(doc, 'app.bsky.feed.like', undefined, limiter);
  await syncRecords(doc, 'app.bsky.feed.repost', undefined, limiter);
  await syncRecords(doc, 'app.bsky.feed.post', undefined, limiter);

  await SyncProfile.findByIdAndUpdate(did, {
    updated: true,
    status: 'synced'
  });
  console.log(`Updated profile of @${profile.handle} [${profile.did}]`);

  return true;
}

async function run() {
  await connectDb();

  const app = express();

  app.get('/update/:did', async (req, res) => {
    const couldUpdate = await syncOneProfile(req.params.did);
    if (!couldUpdate) {
      return res.send('could not find did');
    }
    return res.send('done!');
  });

  app.listen(6789, () => {
    console.log('listening');
  });

  console.log(`[tasker] started`);
}

run();
