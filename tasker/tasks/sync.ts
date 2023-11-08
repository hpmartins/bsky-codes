import { Block, Interaction, SyncProfile } from '../../common/db';
import { syncRecords } from '../../common';
import { AtprotoData } from '@atproto/identity';
import { AppContext } from '../index';
import dayjs from 'dayjs';
import { AppBskyGraphBlock } from '@atproto/api';

export async function syncBlockRecords(ctx: AppContext, repo: string) {
  if (ctx.cache.get(repo)) return;

  const syncTest = await SyncProfile.findById(repo)
  if (syncTest) return;

  const blocks = await getAllBlockRecords(ctx, repo);
  if (blocks && blocks.length > 0) {
    for (const block of blocks) {
      await Block.updateOne({ _id: block._id }, block, { timestamps: false, strict: false, upsert: true })
    }
    ctx.log(`updated ${blocks.length} blocks of ${repo}`)
  }
  ctx.cache.set(repo, Date.now());
}

async function getAllBlockRecords(ctx: AppContext, did: string) {
  let cursor: string | undefined;
  let blocks: { [key: string]: any }[] = [];
  do {
    const { data } = await ctx.limiter.schedule(() => ctx.api.com.atproto.repo.listRecords({
      repo: did,
      collection: 'app.bsky.graph.block',
      limit: 100,
      cursor: cursor
    }));

    if (!!data && data.records.length > 0) {
      for (const record of data.records) {
        if (AppBskyGraphBlock.isRecord(record.value)) {
          blocks.push(
          {
            _id: record.uri,
            author: did,
            subject: record.value.subject,
            createdAt: dayjs(record.value.createdAt).toDate(),
            updatedAt: dayjs().toDate(),
          })
        }
      }
    }
    cursor = data?.cursor ?? undefined;
  } while (!!cursor && cursor.length > 0);
  return blocks;
}

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
