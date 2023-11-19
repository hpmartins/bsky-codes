import dayjs from 'dayjs';
import { Interaction } from '../db';

export type SimpleProfileType = {
    did: string;
    avatar: string;
    displayName: string;
    handle: string;
};

export type InteractionsType = {
    _id: string;
    idx?: number;
    characters: number;
    replies: number;
    likes: number;
    reposts: number;
    total: number;
    points: number;
    profile: SimpleProfileType;
};

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
): Promise<InteractionsType[]> => {
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

export const getInteractionsByDateRange = async (
    actor: string,
    which: 'author' | 'subject',
    options: {
        start: Date;
        end?: Date;
        limit?: number;
    }
): Promise<InteractionsType[]> => {
    let query = Interaction.aggregate();

    if (which === 'author') {
        query = query.match({ '_id.author': actor });
    } else {
        query = query.match({ '_id.subject': actor });
    }

    query = query
        .match({ $expr: { $ne: ['$_id.author', '$_id.subject'] } })
        .unwind('$list')
        .match({
            'list._id': options.end
                ? { $gte: options.start, $lte: options.end }
                : { $gte: options.start }
        })
        .project({
            _id: 0,
            did: which === 'author' ? '$_id.subject' : '$_id.author',
            date: '$list._id',
            characters: '$list.characters',
            replies: '$list.replies',
            likes: '$list.likes',
            reposts: '$list.reposts'
        })
        .group({
            _id: {
                did: '$did'
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
        })
        .addFields({
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
        })
        .sort({ points: 'descending' })
        .group({
            _id: 0,
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
        })
        .unwind('$list')
        .replaceRoot('$list');

    if (options.limit) query = query.limit(options.limit);

    query = query
        .lookup({
            from: 'profiles',
            localField: '_id',
            foreignField: '_id',
            as: 'profile'
        })
        .unwind('$profile')
        .project({
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
        });

    return await query.exec();
};

export const searchInteractions = async (input: {
    did: string;
    handle: string;
    weekly?: {
        week: string;
        year: string;
    };
    range?: string;
}): Promise<{[key: string]: InteractionsType[]} | undefined> => {
    let sent: InteractionsType[] | undefined;
    let rcvd: InteractionsType[] | undefined;
    if (input.weekly) {
        sent = await getInteractions(input.did, 'author', input.weekly.week, input.weekly.year);
        rcvd = await getInteractions(input.did, 'subject', input.weekly.week, input.weekly.year);
    } else {
        let start: Date | undefined = undefined;
        let limit = 3000;
        if (input.range === 'all') {
            start = dayjs().subtract(10, 'year').toDate();
            limit = 1000;
        } else if (input.range === 'month') {
            start = dayjs().subtract(1, 'month').startOf('day').toDate();
        } else if (input.range === 'week') {
            start = dayjs().subtract(1, 'week').startOf('day').toDate();
        } else if (input.range === 'day') {
            start = dayjs().subtract(24, 'hour').startOf('day').toDate();
        }
        if (start !== undefined) {
            sent = await getInteractionsByDateRange(input.did, 'author', {
                start: start,
                limit: limit
            });
            rcvd = await getInteractionsByDateRange(input.did, 'subject', {
                start: start,
                limit: limit
            });
        }
    }

    if (sent && rcvd) {
        let both = sent.concat(rcvd);
        const summed: { [key: string]: InteractionsType } = {};
        both.forEach((x) => {
          if (x._id in summed) {
            summed[x._id].characters += x.characters;
            summed[x._id].replies += x.replies;
            summed[x._id].likes += x.likes;
            summed[x._id].reposts += x.reposts;
            summed[x._id].total += x.total;
            summed[x._id].points += x.points;
          } else {
            summed[x._id] = {
              _id: x._id,
              profile: x.profile,
              characters: x.characters,
              replies: x.replies,
              likes: x.likes,
              reposts: x.reposts,
              total: x.total,
              points: x.points,
            };
          }
        });
        both = Object.values(summed).sort((a, b) => {
          return (b.points as number) - (a.points as number);
        });

        return {
            sent: sent.map((x, idx) => ({ idx: idx + 1, ...x })),
            rcvd: rcvd.map((x, idx) => ({ idx: idx + 1, ...x })),
            both: both.map((x, idx) => ({ idx: idx + 1, ...x })),
        }
    }
    return;
};
