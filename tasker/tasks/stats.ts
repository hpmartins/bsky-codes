import dayjs from 'dayjs';
import { Block, Post } from '../../common';

export const getTopBlocked = async () => {
  return await Block.aggregate([
    {
      $match: {
        createdAt: {
          $gt: dayjs().startOf('date').subtract(1, 'week').toDate()
        },
        deleted: false
      }
    },
    {
      $project: {
        subject: '$subject'
      }
    },
    {
      $group: {
        _id: '$subject',
        count: {
          $count: {}
        }
      }
    },
    {
      $sort: {
        count: -1
      }
    },
    {
      $limit: 200
    },
    {
      $lookup: {
        from: 'profiles',
        localField: '_id',
        foreignField: '_id',
        as: 'profile'
      }
    },
    {
      $unwind: {
        path: '$profile'
      }
    }
  ]);
};

export const getTopPosters = async () => {
  const query = await Post.aggregate([
    {
      $match: {
        createdAt: {
          $gt: dayjs().subtract(24, 'hour').toDate()
        }
      }
    },
    {
      $match: { deleted: false }
    },
    {
      $group: {
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
      }
    },
    {
      $sort: {
        count: -1
      }
    },
    {
      $limit: 200
    },
    {
      $lookup: {
        from: 'profiles',
        localField: '_id',
        foreignField: '_id',
        as: 'profile'
      }
    },
    {
      $unwind: {
        path: '$profile'
      }
    }
  ]);

  return query;
};
