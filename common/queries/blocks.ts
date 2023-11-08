import { Block } from '../db';

export const getAllBlocks = async (actor: string, which: 'author' | 'subject') => {
  const data = await Block.aggregate([
    {
      $match: which === 'author' ? { author: actor } : { subject: actor }
    },
    {
      $match: { deleted: false },
    },
    {
      $lookup: {
        from: 'profiles',
        localField: which === 'author' ? 'subject' : 'author',
        foreignField: '_id',
        as: 'profile'
      }
    },
    {
      $unwind: {
        path: '$profile'
      }
    },
    {
      $sort: {
        createdAt: -1
      }
    },
    {
      $project: {
        did: which === 'author' ? '$subject' : '$author',
        deleted: '$deleted',
        createdAt: '$createdAt',
        updatedAt: '$updatedAt',
        profile: {
          avatar: '$profile.avatar',
          displayName: '$profile.displayName',
          handle: '$profile.handle'
        }
      }
    },
    {
      $unset: '__v'
    }
  ]);

  return data.map((x, idx) => ({ idx: idx + 1, ...x }));
};
