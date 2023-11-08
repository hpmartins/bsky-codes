import dayjs from 'dayjs';
import { Block, ITopBlocked, ITopPosters, Post, TopBlocked, TopPosters } from '../../common/db';

export const storeTopBlocked = async () => {
  const [ query ] = await Block.aggregate<ITopBlocked>()
    .match({
        createdAt: { $gt: dayjs().subtract(6, 'hour').toDate() },
        deleted: false
    })
    .project({ subject: '$subject' })
    .group({ _id: '$subject', count: { $count: {} }})
    .sort({ count: -1 })
    .limit(100)
    .group({ _id: new Date(), table: { $push: "$$ROOT" }})

  await TopBlocked.create(query)
};

export const storeTopPosters = async () => {
  const [ query ] = await Post.aggregate<ITopPosters>()
    .match({
      createdAt: { $gt: dayjs().subtract(24, 'hour').toDate() },
      deleted: false
    })
    .group({
      _id: '$author',
      count: {
        $count: {}
      },
      characters: {
        $sum: '$textLength'
      },
      likes: {
        $sum: '$likes'
      },
      replies: {
        $sum: '$comments'
      },
      reposts: {
        $sum: '$reposts'
      }
    })
    .match({ count: { $gte: 10 } })
    .sort({ count: -1 })
    .limit(200)
    .lookup({
      from: 'profiles',
      localField: '_id',
      foreignField: '_id',
      as: 'profile'
    })
    .unwind({ path: '$profile' })
    .group({ _id: new Date(), table: { $push: "$$ROOT" }})

  await TopPosters.create(query)
};
