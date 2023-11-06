import { IdResolver } from "@atproto/identity";
import {
  OutputSchema as RepoEvent,
  isCommit,
} from "../../lexicon/types/com/atproto/sync/subscribeRepos";
import { FirehoseSubscriptionBase, getOpsByType } from "./subscription";
import {
  AppBskyEmbedImages,
  AppBskyEmbedRecordWithMedia,
  AppBskyEmbedRecord,
} from "@atproto/api";
import { AppContext } from "./index";
import { ProfileViewDetailed } from "../../lexicon/types/app/bsky/actor/defs";

import { getDateTime } from "@common/index";
import {
  Block,
  FeedGen,
  Follow,
  Like,
  List,
  Interaction,
  Post,
  Profile,
  Repost,
} from "@common/db";

export const getUserHandle = async (idResolver: IdResolver, did: string) => {
  const userDoc = await idResolver.did.resolve(did);
  if (userDoc?.alsoKnownAs) {
    return userDoc.alsoKnownAs[0].replace("at://", "");
  }
};

const dayOfYear = (date: Date) => {
  const diff = date.getTime() - new Date(date.getFullYear(), 0, 0).getTime();
  return Math.floor(diff / 1000 / 60 / 60 / 24);
};

const dateIdentifier = (): [number, number] => {
  return [dayOfYear(new Date()), new Date().getFullYear()];
};

export const updatePartition = async (
  author: string,
  subject: string,
  date: string,
  inc: any,
  push: any
) => {
  try {
    const authorSubjectCheck = await Interaction.exists({
      _id: { author: author, subject: subject },
    });
    if (authorSubjectCheck) {
      const dateCheck = await Interaction.exists({
        _id: { author: author, subject: subject },
        "list._id": date,
      });
      if (dateCheck) {
        // console.log('subjectCheck true')
        await Interaction.updateOne(
          {
            _id: { author: author, subject: subject },
            "list._id": date,
          },
          { $inc: inc },
          // { projection: { "list.$": 1 } }
        );
      } else {
        // console.log('subjectCheck false')
        await Interaction.updateOne(
          {
            _id: { author: author, subject: subject },
          },
          {
            $push: {
              list : push
            },
          },
          // { projection: { "list.$": 1 } }
        );
      }
    } else {
      // console.log('partitionCheck false')
      await Interaction.updateOne(
        {
          _id: { author: author, subject: subject },
        },
        {
          $push: {
            list: push
          },
        },
        { upsert: true }
      );
    }
  }
  catch (e) {
    console.log('###########################################')
    console.log(author)
    console.log(subject)
    console.log(inc)
    console.log(push)
    console.log('###########################################')
  }

}

export async function updateProfile(
  ctx: AppContext,
  did: string
): Promise<ProfileViewDetailed | undefined> {
  try {
    const res = await ctx.api.getProfile({ actor: did });
    const profile = res.data as ProfileViewDetailed;
    if (!!profile) {
      const query = await Profile.findOne({ _id: did }, "indexedAt");
      if (!!query && !!query.indexedAt) {
        await Profile.updateOne(
          { _id: did },
          {
            handle: profile.handle,
            displayName: profile.displayName,
            avatar: profile.avatar ?? null,
            description: profile.description ?? null,
            lastProfileUpdateAt: getDateTime(),
          },
          { upsert: true }
        );
      } else {
        await Profile.updateOne(
          { _id: did },
          {
            handle: profile.handle,
            displayName: profile.displayName,
            avatar: profile.avatar ?? null,
            description: profile.description ?? null,
            indexedAt: profile.indexedAt
              ? getDateTime(new Date(profile.indexedAt))
              : null,
            lastProfileUpdateAt: getDateTime(),
          },
          { upsert: true }
        );
      }
      return profile;
    } else {
      ctx.log(`[ERROR] Could not find profile: ${did}`);
    }
  } catch (e: any) {
    if (e.error === "AccountTakedown") {
      await Profile.updateOne(
        { _id: did },
        {
          displayName: "Account has been taken down",
          lastProfileUpdateAt: getDateTime(),
        }
      );
    }
  }
  return;
}

export class FirehoseWorker extends FirehoseSubscriptionBase {
  async handleEvent(evt: RepoEvent) {
    if (!isCommit(evt)) return;
    const ops = await getOpsByType(evt);

    const profilesToDelete = ops.profiles.deletes.map((del) => del.uri);
    const feedgensToDelete = ops.feedgens.deletes.map((del) => del.uri);
    const postsToDelete = ops.posts.deletes.map((del) => del.uri);
    const blocksToDelete = ops.blocks.deletes.map((del) => del.uri);
    const followsToDelete = ops.follows.deletes.map((del) => del.uri);
    const likesToDelete = ops.likes.deletes.map((del) => del.uri);
    const repostsToDelete = ops.reposts.deletes.map((del) => del.uri);
    const listsToDelete = ops.lists.deletes.map((del) => del.uri);
    const listitemsToDelete = ops.listitems.deletes.map((del) => del.uri);
    const profilesToCreate = ops.profiles.creates.map((create) => {
      return {
        _id: create.author,
        description: create.record.description,
        displayName: create.record.displayName,
      };
    });
    const profilesToUpdate = ops.profiles.updates?.map((create) => {
      return {
        _id: create.author,
        description: create.record.description,
        displayName: create.record.displayName,
      };
    });
    const feedgensToCreate = ops.feedgens.creates.map((create) => {
      return {
        _id: create.uri,
        author: create.author,
        name: create.uri.split("/").slice(-1)[0],
        feedDid: create.record.did,
        description: create.record.description ?? "",
        displayName: create.record.displayName,
      };
    });
    const feedgensToUpdate = ops.feedgens.updates?.map((update) => {
      return {
        _id: update.uri,
        author: update.author,
        name: update.uri.split("/").slice(-1)[0],
        feedDid: update.record.did,
        description: update.record.description ?? "",
        displayName: update.record.displayName,
      };
    });
    const postsToCreate = ops.posts.creates.map((create) => {
      let hasImages = 0;
      let altText: string[] | null = null;
      let quoteUri: string | null = null;

      // post with images
      if (AppBskyEmbedImages.isMain(create.record.embed)) {
        hasImages = create.record.embed.images.length;
        altText = create.record.embed.images.map((x) => x.alt);
      }

      // text-only post quoting a post
      if (AppBskyEmbedRecord.isMain(create.record.embed)) {
        quoteUri = create.record.embed.record.uri;
      }

      // post with media quoting a post
      if (AppBskyEmbedRecordWithMedia.isMain(create.record.embed)) {
        if (AppBskyEmbedRecord.isMain(create.record.embed.record)) {
          quoteUri = create.record.embed.record.record.uri;
        }
        if (AppBskyEmbedImages.isMain(create.record.embed.media)) {
          hasImages = create.record.embed.media.images.length;
          altText = create.record.embed.media.images.map((x) => x.alt);
        }
      }

      return {
        _id: create.uri,
        author: create.author,
        text: create.record.text,
        replyParent: create.record?.reply?.parent.uri ?? null,
        replyRoot: create.record?.reply?.root.uri ?? null,
        quoteUri: quoteUri ?? null,
        altText: altText ?? null,
        langs: create.record.langs ?? null,
        hasImages: hasImages,
        textLength: create.record?.text.length,
      };
    });
    const blocksToCreate = ops.blocks.creates.map((create) => {
      return {
        _id: create.uri,
        author: create.author,
        subject: create.record.subject,
      };
    });
    const followsToCreate = ops.follows.creates.map((create) => {
      return {
        _id: create.uri,
        author: create.author,
        subject: create.record.subject,
      };
    });
    const likesToCreate = ops.likes.creates.map((create) => {
      return {
        _id: create.uri,
        author: create.author,
        subject: create.record.subject.uri.split("/")[2],
        subjectUri: create.record.subject.uri,
      };
    });
    const repostsToCreate = ops.reposts.creates.map((create) => {
      return {
        _id: create.uri,
        author: create.author,
        subject: create.record.subject.uri.split("/")[2],
        subjectUri: create.record.subject.uri,
      };
    });
    const listsToCreate = ops.lists.creates.map((create) => {
      return {
        _id: create.uri,
        author: create.author,
        name: create.record.name,
        purpose: create.record.purpose,
        description: create.record.description,
      };
    });
    const listsToUpdate = ops.lists.updates?.map((update) => {
      return {
        _id: update.uri,
        name: update.record.name,
        purpose: update.record.purpose,
        description: update.record.description,
      };
    });
    const listitemsToCreate = ops.listitems.creates.map((create) => {
      return {
        _id: create.uri,
        list: create.record.list,
        subject: create.record.subject,
      };
    });

    if (this.ctx.cfg.devel) return;

    if (!this.ctx.cache.get(evt.repo)) {
      this.ctx.cache.set(evt.repo, Date.now());
      await updateProfile(this.ctx, evt.repo);
      this.ctx.log(`[indexer] updating profile ${evt.repo}`)
    }

    const date = new Date().toLocaleDateString('en-CA')

    // Profiles
    if (profilesToCreate.length > 0) {
      for (const profile of profilesToCreate) {
        await Profile.updateOne(
          {
            _id: profile._id,
          },
          profile,
          { upsert: true }
        );
      }
    }
    if (!!profilesToUpdate && profilesToUpdate.length > 0) {
      for (const profile of profilesToUpdate) {
        await Profile.updateOne(
          {
            _id: profile._id,
          },
          profile,
          { upsert: true }
        );
        await updateProfile(this.ctx, evt.repo);
      }
    }
    if (profilesToDelete.length > 0) {
      for (const profile of profilesToDelete) {
        await Profile.updateOne({ _id: profile }, { deleted: true });
      }
    }

    // Feed Generators
    if (feedgensToCreate.length > 0) {
      for (const feedgen of feedgensToCreate) {
        await FeedGen.updateOne({ _id: feedgen._id }, feedgen, {
          upsert: true,
        });
      }
    }
    if (!!feedgensToUpdate && feedgensToUpdate.length > 0) {
      for (const feedgen of feedgensToUpdate) {
        await FeedGen.updateOne({ _id: feedgen._id }, feedgen, {
          upsert: true,
        });
      }
    }
    if (feedgensToDelete.length > 0) {
      for (const feedgen of feedgensToDelete) {
        await FeedGen.deleteOne({ _id: feedgen });
      }
    }

    // Posts
    if (postsToCreate.length > 0) {
      // Create post
      for (const postToCreate of postsToCreate) {
        await Post.updateOne({ _id: postToCreate._id }, postToCreate, {
          upsert: true,
        });
      }
      // Increment comments counter on parent post (if exists)
      const postsWithParent = postsToCreate.flatMap((f) =>
        !!f.replyParent
          ? [{ uri: f.replyParent, characters: f.textLength }]
          : []
      );

      if (postsWithParent.length > 0) {
        for (const postWithParent of postsWithParent) {
          await Post.updateOne(
            {
              _id: postWithParent.uri,
            },
            { $inc: { comments: 1 } }
          );

          const subject = postWithParent.uri.split("/")[2];
          await updatePartition(
            evt.repo,
            subject,
            date,
            {
              "list.$.replies": 1,
              "list.$.characters": postWithParent.characters,
            },
            {
              _id: date,
              replies: 1,
              characters: postWithParent.characters,
            }
          );
        }
      }

      // Increment reposts counter on quoted post (if it is quoting)
      const postsWithQuote = postsToCreate.flatMap((f) =>
        !!f.quoteUri ? [{ uri: f.quoteUri, characters: f.textLength }] : []
      );

      if (postsWithQuote.length > 0) {
        for (const postWithQuote of postsWithQuote) {
          await Post.updateOne(
            {
              _id: postWithQuote.uri,
            },
            { $inc: { reposts: 1 } }
          );

          const subject = postWithQuote.uri.split("/")[2];
          await updatePartition(
            evt.repo,
            subject,
            date,
            {
              "list.$.replies": 1,
              "list.$.characters": postWithQuote.characters,
            },
            {
              _id: date,
              replies: 1,
              characters: postWithQuote.characters,
            }
          );
        }
      }
    }
    if (postsToDelete.length > 0) {
      for (const postToDelete of postsToDelete) {
        await Post.updateOne({ _id: postToDelete }, { deleted: true });
      }
    }

    // Blocks
    if (blocksToCreate.length > 0) {
      for (const block of blocksToCreate) {
        await Block.updateOne({ _id: block._id }, block, { upsert: true });
      }
    }
    if (blocksToDelete.length > 0) {
      for (const block of blocksToDelete) {
        await Block.updateOne({ _id: block }, { deleted: true });
      }
    }

    // Follows
    if (followsToCreate.length > 0) {
      for (const follow of followsToCreate) {
        await Follow.updateOne({ _id: follow._id }, follow, { upsert: true });
      }
    }
    if (followsToDelete.length > 0) {
      for (const follow of followsToDelete) {
        await Follow.deleteOne({ _id: follow });
      }
    }

    // Likes
    if (likesToCreate.length > 0) {
      // Partitions
      for (const likeToCreate of likesToCreate) {
        await Like.updateOne({ _id: likeToCreate._id }, likeToCreate, {
          upsert: true,
        });

        await updatePartition(
          evt.repo,
          likeToCreate.subject,
          date,
          { "list.$.likes": 1 },
          { _id: date, likes: 1 }
        );

        // Counter on post
        await Post.updateOne(
          {
            _id: likeToCreate.subjectUri,
          },
          { $inc: { likes: 1 } }
        );
      }
    }
    if (likesToDelete.length > 0) {
      for (const likeToDelete of likesToDelete) {
        const likeDoc = await Like.findById(likeToDelete).exec();

        if (!!likeDoc) {
          await Post.updateOne(
            { _id: likeDoc.subjectUri },
            { $inc: { likes: -1 } }
          );

          await updatePartition(
            evt.repo,
            likeDoc.subject,
            date,
            { "list.$.likes": -1 },
            { _id: date, likes: 0 }
          );

          likeDoc.deleteOne();
        }
      }
    }

    // Reposts
    if (repostsToCreate.length > 0) {
      for (const repostToCreate of repostsToCreate) {
        // Add repost
        await Repost.updateOne({ _id: repostToCreate._id }, repostToCreate, {
          upsert: true,
        });

        // Partitions
        await updatePartition(
          evt.repo,
          repostToCreate.subject,
          date,
          { "list.$.reposts": 1 },
          { _id: date, reposts: 1 }
        );

        // Counter on post
        await Post.updateOne(
          {
            _id: repostToCreate.subjectUri,
          },
          { $inc: { reposts: 1 } }
        );
      }
    }
    if (repostsToDelete.length > 0) {
      for (const repostToDelete of repostsToDelete) {
        const repostDoc = await Repost.findById(repostToDelete).exec();

        if (!!repostDoc) {
          await Post.updateOne(
            { _id: repostDoc.subjectUri },
            { $inc: { reposts: -1 } }
          );

          await updatePartition(
            evt.repo,
            repostDoc.subject,
            date,
            { "list.$.reposts": -1 },
            { _id: date, reposts: 0 }
          );

          repostDoc.deleteOne();
        }
      }
    }

    // Lists
    if (listsToCreate.length > 0) {
      for (const listToCreate of listsToCreate) {
        await List.updateOne({ _id: listToCreate._id }, listToCreate, {
          upsert: true,
        });
      }
    }
    if (!!listsToUpdate && listsToUpdate.length > 0) {
      for (const listToUpdate of listsToUpdate) {
        await List.updateOne(
          {
            _id: listToUpdate._id,
          },
          listToUpdate
        );
      }
    }
    if (listsToDelete.length > 0) {
      for (const listToDelete of listsToCreate) {
        await List.deleteOne(listToDelete);
      }
    }

    // List items
    if (listitemsToCreate.length > 0) {
      for (const listitemToCreate of listitemsToCreate) {
        await List.updateOne(
          {
            _id: listitemToCreate.list,
          },
          {
            $push: {
              items: {
                _id: listitemToCreate._id,
                subject: listitemToCreate.subject,
              },
            },
          }
        );
      }
    }
    if (listitemsToDelete.length > 0) {
      for (const listitemToDelete of listitemsToDelete) {
        await List.updateOne(
          { "items._id": listitemToDelete },
          {
            $pull: {
              items: { _id: listitemToDelete },
            },
          },
          { projection: { "items.$": 1 } }
        );
      }
    }
  }
}
