import { Post, WolfgangLick } from '../../common/db';
import { AppContext } from '../index';
import dayjs from 'dayjs';

export async function updateLickablePosts(ctx: AppContext, lickablePeople: ILickablePeople[]) {
  const possiblePosts = await Post.aggregate()
    .match({
      createdAt: {
        $gte: dayjs().subtract(4, 'hour').toDate(),
        $lt: dayjs().subtract(30, 'minute').toDate()
      },
      author: {
        $in: lickablePeople.map((x) => x.did)
      }
    })
    .match({
      quoteUri: null,
      replyRoot: null,
      langs: 'pt',
      deleted: false,
    })
    .lookup({
      from: 'profiles',
      localField: 'author',
      foreignField: '_id',
      as: 'profile',
    })
    .unwind({ path: '$profile' })
    .project({
      cid: '$cid',
      handle: '$profile.handle',
      postedAt: '$createdAt',
      points: {
        $add: [
          { $multiply: [1, '$likes'] },
          { $multiply: [2, '$reposts'] }
        ]
      }
    })
    .match({
      points: { $gte: 8 }
    })

  for (const post of possiblePosts) {
    await WolfgangLick.updateOne({ _id: post._id }, post, { upsert: true })
  }

  await WolfgangLick.find({
    postedAt: { $lt: dayjs().subtract(4, 'hour') },
    reposted: false,
  }).deleteMany()

  const repostablePosts = await WolfgangLick.find({
    points: { $gte: 8, $lte: 25 },
    reposted: false,
  })
  for (const post of repostablePosts) {
    try {
      ctx.log(`reposting: ${post.postedAt} @${post.handle} ${post.points}p ${post._id}`)
      await ctx.api.repost(post._id, post.cid)
      await WolfgangLick.findByIdAndUpdate(post._id, { reposted: true })
    } catch (e) {
      ctx.log(`[ERROR] reposting: ${post.postedAt} @${post.handle} ${post.points}p ${post._id}`)
    }
  }
}

async function getAllFollowers(ctx: AppContext) {
  let cursor: string | undefined;
  let followers: { uri: string | undefined; did: string; handle: string }[] = [];
  do {
    const { data } = await ctx.api.getFollowers({
      actor: ctx.cfg.bskyDid,
      limit: 100,
      cursor: cursor
    });

    if (!!data && data.followers.length > 0) {
      followers.push(...data.followers.map((x) => ({ uri: x.viewer?.followedBy, did: x.did, handle: x.handle })));
    }
    cursor = data?.cursor ?? undefined;
  } while (!!cursor && cursor.length > 0);
  return followers;
}

async function getAllFollows(ctx: AppContext) {
  let cursor: string | undefined;
  let follows: { uri: string | undefined; did: string; handle: string }[] = [];
  do {
    const { data } = await ctx.api.getFollows({
      actor: ctx.cfg.bskyDid,
      limit: 100,
      cursor: cursor
    });

    if (!!data && data.follows.length > 0) {
      follows.push(...data.follows.map((x) => ({ uri: x.viewer?.following, did: x.did, handle: x.handle })));
    }
    cursor = data?.cursor ?? undefined;
  } while (!!cursor && cursor.length > 0);
  return follows;
}

interface ILickablePeople {
  uri: string | undefined;
  did: string;
  handle: string;
}

export async function updateLickablePeople(ctx: AppContext): Promise<ILickablePeople[]> {
  const timeStart = Date.now();

  const unlickableListUri = 'at://did:plc:y4rd5hesgwwbkblvkkidfs73/app.bsky.graph.list/3k3jnxzkl322v';
  const unlickableList = await ctx.api.app.bsky.graph.getList({ list: unlickableListUri });
  const unlickablePeople = unlickableList.data.items.map((x) => ({ did: x.subject.did, handle: x.subject.handle }));
  const followers = await getAllFollowers(ctx);
  const follows = await getAllFollows(ctx);

  const they_dont_follow_me_back = follows.filter((x) => !followers.map((y) => y.did).includes(x.did));
  const i_follow_but_shouldnt = follows.filter((x) => unlickablePeople.map((y) => y.did).includes(x.did));
  const i_dont_follow_them_back = followers
    .filter((x) => !follows.map((y) => y.did).includes(x.did))
    .filter((x) => !unlickablePeople.map((y) => y.did).includes(x.did));

  for (const to_unfollow of they_dont_follow_me_back) {
    if (to_unfollow.uri) {
      ctx.log(`[wolfgang] unfollowing (unfollow-based): ${to_unfollow.handle}`);
        await ctx.api.deleteFollow(to_unfollow.uri);
    }
  }

  for (const to_unfollow of i_follow_but_shouldnt) {
    if (to_unfollow.uri) {
      ctx.log(`[wolfgang] unfollowing (list-based): ${to_unfollow.handle}`);
        await ctx.api.deleteFollow(to_unfollow.uri);
    }
  }

  for (const to_follow of i_dont_follow_them_back) {
    if (to_follow.uri) {
      ctx.log(`[wolfgang] following: ${to_follow.handle}`);
        await ctx.api.follow(to_follow.did);
    }
  }

  let finalFollowers = follows.filter(
    (x) => !they_dont_follow_me_back.map((y) => y.did).includes(x.did) && !i_follow_but_shouldnt.map((y) => y.did).includes(x.did)
  );
  finalFollowers.push(...i_dont_follow_them_back);

  ctx.log(`[wolfgang] updated my followers in ${(Date.now() - timeStart) / 1000}s`);
  return finalFollowers;
}
