import { listRepos, syncRecords } from '../common';
import { Profile, SyncProfile, SyncState } from '../common/db';
import { DidResolver } from '@atproto/identity';
import { AppContext } from './index';

export async function runSync(ctx: AppContext) {
  let repoIndex: number = 0;
  let repoCursor: string | undefined;

  const didres = new DidResolver({});

  // Backfilling
  const syncState = await SyncState.findById('main');
  let collection: string | undefined;
  let collectionCursor: string | undefined;
  if (!!syncState) {
    repoCursor = syncState.repoCursor ?? undefined;
    collection = syncState.col ?? undefined;
    collectionCursor = syncState.colCursor ?? undefined;
  }

  do {
    const response = await ctx.limiter.schedule(async () =>
      listRepos({
        limit: 200,
        cursor: repoCursor
      })
    );
    repoIndex = 0;

    if (response && response.repos) {
      for (const [idx, repo] of response.repos.entries()) {
        if (syncState && repoCursor === syncState.repoCursor && idx < syncState.repoIndex) {
          repoIndex++;
          continue;
        }

        const doc = await didres.resolveAtprotoData(repo.did);
        if (!doc) {
          repoIndex++;
          continue;
        }

        const syncProfile = await SyncProfile.findById(repo.did);
        if (!!syncProfile && syncProfile.updated) {
          ctx.log(`Already updated: ${repo.did}`);
          repoIndex++;
          continue;
        } else {
          await SyncProfile.findByIdAndUpdate(
            repo.did,
            {
              updated: false,
              status: 'updating'
            },
            { upsert: true }
          );
        }

        await Profile.findByIdAndUpdate(
          {
            _id: repo.did
          },
          {
            handle: doc.handle
          },
          { upsert: true }
        );

        ctx.log(`${doc.did} @${doc.handle}`);

        await SyncState.updateOne(
          { _id: 'main' },
          {
            repoCursor: repoCursor,
            repoIndex: idx,
            repoDid: repo.did
          },
          { upsert: true }
        );

        if (!collection) {
          const options = { limiter: ctx.limiter, log: ctx.log };
          await syncRecords(doc, 'app.bsky.graph.block', options);
          await syncRecords(doc, 'app.bsky.feed.like', options);
          await syncRecords(doc, 'app.bsky.feed.repost', options);
          await syncRecords(doc, 'app.bsky.feed.post', options);
        } else {
          const options = { start: collectionCursor, limiter: ctx.limiter, log: ctx.log };
          if (collection === 'app.bsky.graph.block') {
            await syncRecords(doc, 'app.bsky.graph.block', options);
            await syncRecords(doc, 'app.bsky.feed.like', options);
            await syncRecords(doc, 'app.bsky.feed.repost', options);
            await syncRecords(doc, 'app.bsky.feed.post', options);
          } else if (collection === 'app.bsky.feed.like') {
            await syncRecords(doc, 'app.bsky.feed.like', options);
            await syncRecords(doc, 'app.bsky.feed.repost', options);
            await syncRecords(doc, 'app.bsky.feed.post', options);
          } else if (collection === 'app.bsky.feed.repost') {
            await syncRecords(doc, 'app.bsky.feed.repost', options);
            await syncRecords(doc, 'app.bsky.feed.post', options);
          } else if (collection === 'app.bsky.feed.post') {
            await syncRecords(doc, 'app.bsky.feed.post', options);
          }
          collection = undefined;
          collectionCursor = undefined;
        }

        await SyncProfile.findByIdAndUpdate(repo.did, {
          updated: true,
          status: 'backfilled'
        });

        repoIndex++;
      }
    }
    repoCursor = response?.cursor ?? undefined;
  } while (!!repoCursor && repoCursor.length > 0);
}
