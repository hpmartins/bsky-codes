import { Interaction, SyncProfile } from '@common/db';
import { syncRecords } from '@common';
import { AtprotoData } from '@atproto/identity';
import { AppContext } from '../index';

export async function syncWaitingProfiles(ctx: AppContext) {
  const list = await SyncProfile.find(
    {
      updated: false,
      status: null
    },
    {},
    { limit: 1 }
  ).sort({ updatedAt: 1 });
  for (const user of list) {
    const doc = await ctx.didres.resolveAtprotoData(user._id);
    if (!!doc) await syncOneProfile(ctx, doc);
  }
}

export async function syncOneProfile(ctx: AppContext, doc: AtprotoData) {
  ctx.log(`[sync] Updating data of @${doc.handle} [${doc.did}]`);

  const uptodate = new Date('2023-11-01');

  await Interaction.updateMany({ '_id.author': doc.did }, { $pull: { list: { _id: { $lt: uptodate } } } });

  const options = { limiter: ctx.limiter, log: ctx.log, uptodate: uptodate };
  await syncRecords(doc, 'app.bsky.graph.block', options);
  await syncRecords(doc, 'app.bsky.feed.like', options);
  await syncRecords(doc, 'app.bsky.feed.repost', options);
  await syncRecords(doc, 'app.bsky.feed.post', options);

  await SyncProfile.findByIdAndUpdate(doc.did, {
    updated: true,
    status: 'synced'
  });

  ctx.log(`[sync] Updated profile of @${doc.handle} [${doc.did}]`);
}
