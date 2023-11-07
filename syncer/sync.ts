
import Bottleneck from 'bottleneck';
import { listRepos, syncRecords } from '../common/index';
import { Profile, SyncProfile, SyncState } from '../common/db';
import { DidResolver } from '@atproto/identity';

export async function runSync(limiter: Bottleneck) {
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
    const response = await limiter.schedule(async () =>
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
          console.log(`Already updated: ${repo.did}`);
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

        console.log(doc.did, doc.handle);

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
          await syncRecords(doc, 'app.bsky.graph.block', undefined, limiter);
          await syncRecords(doc, 'app.bsky.feed.like', undefined, limiter);
          await syncRecords(doc, 'app.bsky.feed.repost', undefined, limiter);
          await syncRecords(doc, 'app.bsky.feed.post', undefined, limiter);
        } else {
          if (collection === 'app.bsky.graph.block') {
            await syncRecords(doc, 'app.bsky.graph.block', collectionCursor, limiter);
            await syncRecords(doc, 'app.bsky.feed.like', collectionCursor, limiter);
            await syncRecords(doc, 'app.bsky.feed.repost', collectionCursor, limiter);
            await syncRecords(doc, 'app.bsky.feed.post', collectionCursor, limiter);
          } else if (collection === 'app.bsky.feed.like') {
            await syncRecords(doc, 'app.bsky.feed.like', collectionCursor, limiter);
            await syncRecords(doc, 'app.bsky.feed.repost', collectionCursor, limiter);
            await syncRecords(doc, 'app.bsky.feed.post', collectionCursor, limiter);
          } else if (collection === 'app.bsky.feed.repost') {
            await syncRecords(doc, 'app.bsky.feed.repost', collectionCursor, limiter);
            await syncRecords(doc, 'app.bsky.feed.post', collectionCursor, limiter);
          } else if (collection === 'app.bsky.feed.post') {
            await syncRecords(doc, 'app.bsky.feed.post', collectionCursor, limiter);
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
