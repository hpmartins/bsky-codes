import { AppContext } from './index';
import {
  Block,
  FeedGen,
  Follow,
  Like,
  List,
  Post,
  Profile,
  Repost,
  IProfile,
  IBlock,
  IFollow,
  ILike,
  IRepost,
  IList,
  IListItem
} from '../../common/db';
import { IPost, IFeedGen } from '../../common/db';
import { updatePartition, updateProfile } from '../../common/index';

type IDelete = {
  uri: string;
};

export type FirehoseData = {
  repo: string;

  profiles: {
    create: IProfile[];
    delete: IDelete[];
    update: IProfile[];
  };
  feedgens: {
    create: IFeedGen[];
    delete: IDelete[];
    update: IFeedGen[];
  };
  posts: {
    create: IPost[];
    delete: IDelete[];
    update: IPost[];
  };
  blocks: {
    create: IBlock[];
    delete: IDelete[];
  };
  follows: {
    create: IFollow[];
    delete: IDelete[];
  };
  likes: {
    create: ILike[];
    delete: IDelete[];
  };
  reposts: {
    create: IRepost[];
    delete: IDelete[];
  };
  lists: {
    create: IList[];
    delete: IDelete[];
    update: IList[];
  };
  listitems: {
    create: IListItem[];
    delete: IDelete[];
  };
};

export async function processFirehoseStream(ctx: AppContext, data: FirehoseData) {
  const { repo } = data;

  if (!ctx.cache.get(repo)) {
    ctx.cache.set(repo, Date.now());
    await updateProfile(repo);
    ctx.log(`updating profile ${repo}`);
  }

  const date = new Date().toLocaleDateString('en-CA');

  // Profiles
  if (data.profiles.create.length > 0) {
    for (const item of data.profiles.create) {
      await Profile.updateOne(
        {
          _id: item._id
        },
        item,
        { upsert: true }
      );
    }
  }
  if (!!data.profiles.update && data.profiles.update.length > 0) {
    for (const item of data.profiles.update) {
      await Profile.updateOne(
        {
          _id: item._id
        },
        item,
        { upsert: true }
      );
      await updateProfile(repo);
    }
  }
  if (data.profiles.delete.length > 0) {
    for (const item of data.profiles.delete) {
      await Profile.updateOne({ _id: item.uri }, { deleted: true });
    }
  }

  // Feed Generators
  if (data.feedgens.create.length > 0) {
    for (const item of data.feedgens.create) {
      await FeedGen.updateOne({ _id: item._id }, item, {
        upsert: true
      });
    }
  }
  if (!!data.feedgens.update && data.feedgens.update.length > 0) {
    for (const item of data.feedgens.update) {
      await FeedGen.updateOne({ _id: item._id }, item, {
        upsert: true
      });
    }
  }
  if (data.feedgens.delete.length > 0) {
    for (const item of data.feedgens.delete) {
      await FeedGen.deleteOne({ _id: item.uri });
    }
  }

  // Posts
  if (data.posts.create.length > 0) {
    // Create post
    for (const item of data.posts.create) {
      await Post.updateOne({ _id: item._id }, item, {
        upsert: true
      });
    }
    // Increment comments counter on parent post (if exists)
    const postsWithParent = data.posts.create.flatMap((f) =>
      !!f.replyParent ? [{ uri: f.replyParent, characters: f.textLength }] : []
    );

    if (postsWithParent.length > 0) {
      for (const postWithParent of postsWithParent) {
        await Post.updateOne(
          {
            _id: postWithParent.uri
          },
          { $inc: { comments: 1 } }
        );

        const subject = postWithParent.uri.split('/')[2];
        await updatePartition(
          repo,
          subject,
          date,
          {
            'list.$.replies': 1,
            'list.$.characters': postWithParent.characters
          },
          {
            _id: date,
            replies: 1,
            characters: postWithParent.characters
          }
        );
      }
    }

    // Increment reposts counter on quoted post (if it is quoting)
    const postsWithQuote = data.posts.create.flatMap((f) =>
      !!f.quoteUri ? [{ uri: f.quoteUri, characters: f.textLength }] : []
    );

    if (postsWithQuote.length > 0) {
      for (const postWithQuote of postsWithQuote) {
        await Post.updateOne(
          {
            _id: postWithQuote.uri
          },
          { $inc: { reposts: 1 } }
        );

        const subject = postWithQuote.uri.split('/')[2];
        await updatePartition(
          repo,
          subject,
          date,
          {
            'list.$.replies': 1,
            'list.$.characters': postWithQuote.characters
          },
          {
            _id: date,
            replies: 1,
            characters: postWithQuote.characters
          }
        );
      }
    }
  }
  if (data.posts.delete.length > 0) {
    for (const item of data.posts.delete) {
      await Post.updateOne({ _id: item.uri }, { deleted: true });
    }
  }

  // Blocks
  if (data.blocks.create.length > 0) {
    for (const item of data.blocks.create) {
      await Block.updateOne({ _id: item._id }, item, { upsert: true });
    }
  }
  if (data.blocks.delete.length > 0) {
    for (const item of data.blocks.delete) {
      await Block.updateOne({ _id: item.uri }, { deleted: true });
    }
  }

  // Follows
  if (data.follows.create.length > 0) {
    for (const item of data.follows.create) {
      await Follow.updateOne({ _id: item._id }, item, { upsert: true });
    }
  }
  if (data.follows.delete.length > 0) {
    for (const item of data.follows.delete) {
      await Follow.deleteOne({ _id: item.uri });
    }
  }

  // Likes
  if (data.likes.create.length > 0) {
    // Partitions
    for (const item of data.likes.create) {
      await Like.updateOne({ _id: item._id }, item, {
        upsert: true
      });

      await updatePartition(repo, item.subject, date, { 'list.$.likes': 1 }, { _id: date, likes: 1 });

      // Counter on post
      await Post.updateOne(
        {
          _id: item.subjectUri
        },
        { $inc: { likes: 1 } }
      );
    }
  }
  if (data.likes.delete.length > 0) {
    for (const item of data.likes.delete) {
      const likeDoc = await Like.findById(item.uri).exec();

      if (!!likeDoc) {
        await Post.updateOne({ _id: likeDoc.subjectUri }, { $inc: { likes: -1 } });

        await updatePartition(repo, likeDoc.subject, date, { 'list.$.likes': -1 }, { _id: date, likes: 0 });

        likeDoc.deleteOne();
      }
    }
  }

  // Reposts
  if (data.reposts.create.length > 0) {
    for (const item of data.reposts.create) {
      // Add repost
      await Repost.updateOne({ _id: item._id }, item, {
        upsert: true
      });

      // Partitions
      await updatePartition(repo, item.subject, date, { 'list.$.reposts': 1 }, { _id: date, reposts: 1 });

      // Counter on post
      await Post.updateOne(
        {
          _id: item.subjectUri
        },
        { $inc: { reposts: 1 } }
      );
    }
  }
  if (data.reposts.delete.length > 0) {
    for (const item of data.reposts.delete) {
      const repostDoc = await Repost.findById(item.uri).exec();

      if (!!repostDoc) {
        await Post.updateOne({ _id: repostDoc.subjectUri }, { $inc: { reposts: -1 } });

        await updatePartition(repo, repostDoc.subject, date, { 'list.$.reposts': -1 }, { _id: date, reposts: 0 });

        repostDoc.deleteOne();
      }
    }
  }

  // Lists
  if (data.lists.create.length > 0) {
    for (const item of data.lists.create) {
      await List.updateOne({ _id: item._id }, item, {
        upsert: true
      });
    }
  }
  if (!!data.lists.update && data.lists.update.length > 0) {
    for (const item of data.lists.update) {
      await List.updateOne(
        {
          _id: item._id
        },
        item
      );
    }
  }
  if (data.lists.delete.length > 0) {
    for (const item of data.lists.delete) {
      await List.deleteOne({ _id: item.uri });
    }
  }

  // List items
  if (data.listitems.create.length > 0) {
    for (const item of data.listitems.create) {
      await List.updateOne(
        {
          _id: item.list
        },
        {
          $push: {
            items: {
              _id: item._id,
              subject: item.subject
            }
          }
        }
      );
    }
  }
  if (data.listitems.delete.length > 0) {
    for (const item of data.listitems.delete) {
      await List.updateOne(
        { 'items._id': item.uri },
        {
          $pull: {
            items: { _id: item.uri }
          }
        },
        { projection: { 'items.$': 1 } }
      );
    }
  }
}
