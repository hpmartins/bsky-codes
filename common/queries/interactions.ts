import { Interaction } from "../db";

export const getallDates = async (actor: string) => {
    return await Interaction.aggregate([
      {
        $match: {
          $or: [
            {
              '_id.author': actor
            },
            {
              '_id.subject': actor
            }
          ]
        }
      },
      {
        $match: {
          $expr: {
            $ne: ['$_id.author', '$_id.subject']
          }
        }
      },
      {
        $unwind: {
          path: '$list'
        }
      },
      {
        $project: {
          _id: 0,
          week: {
            $isoWeek: '$list._id'
          },
          year: {
            $isoWeekYear: '$list._id'
          }
        }
      },
      {
        $group: {
          _id: {
            week: '$week',
            year: '$year'
          },
          count: {
            $count: {}
          }
        }
      },
      {
        $project: {
          _id: 0,
          week: '$_id.week',
          year: '$_id.year',
          count: '$count'
        }
      },
      {
        $sort: {
          year: 1,
          week: 1
        }
      }
    ]);
  };
  
  export const getInteractions = async (
    actor: string,
    which: 'author' | 'subject',
    week: string,
    year: string
  ) => {
    const query = await Interaction.aggregate([
      {
        $match: which === 'author' ? { '_id.author': actor } : { '_id.subject': actor }
      },
      {
        $match: {
          $expr: {
            $ne: ['$_id.author', '$_id.subject']
          }
        }
      },
      {
        $unwind: {
          path: '$list'
        }
      },
      {
        $project: {
          _id: 0,
          did: which === 'author' ? '$_id.subject' : '$_id.author',
          week: {
            $isoWeek: '$list._id'
          },
          year: {
            $isoWeekYear: '$list._id'
          },
          characters: '$list.characters',
          replies: '$list.replies',
          likes: '$list.likes',
          reposts: '$list.reposts',
          total: {
            $add: ['$list.replies', '$list.likes', '$list.reposts']
          }
        }
      },
      {
        $match: {
          week: week,
          year: year
        }
      },
      {
        $group: {
          _id: {
            did: '$did',
            week: '$week',
            year: '$year'
          },
          characters: {
            $sum: '$characters'
          },
          replies: {
            $sum: '$replies'
          },
          likes: {
            $sum: '$likes'
          },
          reposts: {
            $sum: '$reposts'
          }
        }
      },
      {
        $addFields: {
          total: {
            $add: ['$replies', '$likes', '$reposts']
          },
          points: {
            $add: [
              { $multiply: [2, '$replies'] },
              { $multiply: [1, '$likes'] },
              { $multiply: [2, '$reposts'] }
            ]
          }
        }
      },
      {
        $sort: {
          points: -1
        }
      },
      {
        $group: {
          _id: {
            week: '$_id.week',
            year: '$_id.year'
          },
          list: {
            $push: {
              _id: '$_id.did',
              characters: '$characters',
              replies: '$replies',
              likes: '$likes',
              reposts: '$reposts',
              total: '$total',
              points: '$points'
            }
          }
        }
      },
      {
        $unwind: {
          path: '$list'
        }
      },
      {
        $replaceRoot: {
          newRoot: '$list'
        }
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
      },
      {
        $project: {
          characters: '$characters',
          replies: '$replies',
          likes: '$likes',
          reposts: '$reposts',
          total: '$total',
          points: '$points',
          profile: {
            did: '$profile._id',
            avatar: '$profile.avatar',
            displayName: '$profile.displayName',
            handle: '$profile.handle'
          }
        }
      }
    ]);
  
    return query;
  };
  
  
  