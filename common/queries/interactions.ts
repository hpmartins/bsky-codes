import dayjs, { Dayjs } from 'dayjs';
import { Interaction } from '../db';
import canvas, { loadImage } from 'canvas';
import localizedFormat from 'dayjs/plugin/localizedFormat';
dayjs.extend(localizedFormat);

export type SimpleProfileType = {
    did: string;
    avatar: string | undefined;
    displayName: string | undefined;
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
}): Promise<{ [key: string]: InteractionsType[] } | undefined> => {
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
                    points: x.points
                };
            }
        });
        both = Object.values(summed).sort((a, b) => {
            return (b.points as number) - (a.points as number);
        });

        return {
            sent: sent.map((x, idx) => ({ idx: idx + 1, ...x })),
            rcvd: rcvd.map((x, idx) => ({ idx: idx + 1, ...x })),
            both: both.map((x, idx) => ({ idx: idx + 1, ...x }))
        };
    }
    return;
};

function hex_is_light(color: string) {
    const hex = color.replace('#', '');
    const c_r = parseInt(hex.substring(0, 0 + 2), 16);
    const c_g = parseInt(hex.substring(2, 2 + 2), 16);
    const c_b = parseInt(hex.substring(4, 4 + 2), 16);
    const brightness = (c_r * 299 + c_g * 587 + c_b * 114) / 1000;
    return brightness > 155;
}
const toRad = (x: number) => x * (Math.PI / 180);

export const DO_NOT_INCLUDE_THESE = [
    'did:plc:xxno7p4xtpkxtn4ok6prtlcb', // @lovefairy.nl
    'did:plc:db645kt5coo7teuoxdjhq34x', // @blueskybaddies.bsky.social
    'did:plc:y4rd5hesgwwbkblvkkidfs73', // @wolfgang
    'did:plc:iw47x7htlvpkbbizqn2sgnks' // @whatsmid
];

export const createCirclesImage = async (
    profile: SimpleProfileType,
    data: { [key: string]: InteractionsType[] },
    date: { type: string; start?: Dayjs; end?: Dayjs },
    locale: string | undefined,
) => {
    const width = 600;
    const height = 600;
    const cv = canvas.createCanvas(width, height);
    const context = cv.getContext('2d');

    if (!locale) locale = 'en';

    const options = {
        orbits: 2,
        include_sent: true,
        include_rcvd: true,
        remove_bots: true,
        add_watermark: true,
        add_date: true,
        bg_color: '#1D428A',
        add_border: true,
        border_color: '#FFC72C'
    };

    // decides which interactions to use based on the options
    let interactionsList: InteractionsType[] | undefined;
    if (options.include_sent && options.include_rcvd) {
        interactionsList = data.both;
    } else if (options.include_sent) {
        interactionsList = data.sent;
    } else if (options.include_rcvd) {
        interactionsList = data.rcvd;
    }

    // no image if no data
    if (!interactionsList || interactionsList.length === 0) return;

    // filter bots
    if (options.remove_bots) {
        interactionsList = interactionsList.filter((x) => !DO_NOT_INCLUDE_THESE.includes(x._id));
    }

    // - radial distances for each number of orbits
    // - i chose this manually
    const distances: { [key: number]: number[] } = {
        1: [0, 210, 0, 0],
        2: [0, 158, 246, 0],
        3: [0, 120, 196, 260]
    };

    // radiuses for every orbit for each number of orbits
    const radiuses: { [key: number]: number[] } = {
        1: [125, 55, 0, 0],
        2: [95, 42, 32, 0],
        3: [75, 32, 28, 22]
    };

    // - main input for the image generation later
    // - each block is an orbit, 0-th orbit is the
    //   main profile image
    let config = [
        { distance: 0, count: 1, radius: radiuses[options.orbits][0], users: [profile] },
        {
            distance: distances[options.orbits][1],
            count: 10,
            radius: radiuses[options.orbits][1],
            users: interactionsList.slice(0, 10).map((x) => x.profile)
        },
        {
            distance: distances[options.orbits][2],
            count: 20,
            radius: radiuses[options.orbits][2],
            users: interactionsList.slice(10, 30).map((x) => x.profile)
        },
        {
            distance: distances[options.orbits][3],
            count: 30,
            radius: radiuses[options.orbits][3],
            users: interactionsList.slice(30, 60).map((x) => x.profile)
        }
    ];
    config = config.slice(0, options.orbits + 1);

    const textColor = hex_is_light(options.bg_color) ? '#000000' : '#CCCCCC';

    context.fillStyle = options.bg_color;
    context.fillRect(0, 0, width, height);

    context.imageSmoothingEnabled = true;
    // context.imageSmoothingQuality = 'medium';

    // date on top left corner
    if (options.add_date) {
        let textFull = '';
        if (date.type === 'weekly') {
            const textFrom = date.start?.toDate().toLocaleDateString(locale);
            const textTo = date.end?.toDate().toLocaleDateString(locale);
            textFull = `${textFrom} - ${textTo}`;
        } else if (date.type === 'all') {
            textFull = `${new Date().toLocaleDateString(locale)} (all time)`;
        } else if (date.type === 'month') {
            textFull = `${new Date().toLocaleDateString(locale)} (month)`;
        } else if (date.type === 'week') {
            const textFrom = dayjs().subtract(1, 'week').toDate().toLocaleDateString(locale);
            const textTo = new Date().toLocaleDateString(locale);
            textFull = `${textFrom} - ${textTo}`;
        } else if (date.type === 'day') {
            const textFrom = dayjs().subtract(24, 'hour').toDate().toLocaleDateString(locale);
            const textTo = new Date().toLocaleDateString(locale);
            textFull = `${textFrom} - ${textTo}`;
        }
        context.font = '20px Arial';
        context.fillStyle = textColor;
        context.fillText(textFull, 12, 28);
    }

    // site watermark on top right corner
    if (options.add_watermark) {
        context.font = '20px Arial';
        context.fillStyle = textColor;
        context.textAlign = 'right';
        context.fillText('wolfgang.raios.xyz', 588, 28);
    }

    // add rounded border
    if (options.add_border) {
        context.strokeStyle = options.border_color;
        context.lineWidth = 15;
        context.beginPath();
        context.roundRect(0, 0, width, height, 15);
        context.stroke();
    }
    const promises: Promise<any>[] = [];

    // this will create the image, load the avatar and return a promise
    const preload = (user: { [key: string]: string | undefined }, opt: { [key: string]: number }) =>
        new Promise(async (resolve, reject) => {
            console.log(user);
            const avatar = user.avatar ?? '';
            return loadImage(avatar)
                .then((img) => {
                    context.save();
                    // this draws a circle centered at the image position
                    context.beginPath();
                    context.arc(opt.centerX, opt.centerY, opt.radius, 0, 2 * Math.PI, false);
                    // then clips whatever is out
                    context.clip();
                    // this draws the img at some position with some radius
                    context.drawImage(
                        img,
                        opt.centerX - opt.radius,
                        opt.centerY - opt.radius,
                        opt.radius * 2,
                        opt.radius * 2
                    );
                    context.restore();
                    return resolve(img);
                })
                .catch(() => reject);
        });

    // now we iterate the orbits to actually build the full image
    for (const [orbitIndex, orbit] of config.entries()) {
        const { count, radius, distance, users } = orbit;

        // number of slices in this orbit
        const angleSize = 360 / count;
        // iterate through all users in this orbit
        for (let i = 0; i < count; i++) {
            // if list ends here we stop
            if (!users[i]) break;

            // 30 degrees offset for every additional orbit
            const offset = orbitIndex * 30;
            // final angle for this user at this orbit
            const t = toRad(i * angleSize + offset);

            // push a new image loading thingy into the promises list
            // with the coordinates and radius for that circle
            promises.push(
                preload(
                    { avatar: users[i].avatar, did: users[i].did },
                    {
                        centerX: Math.cos(t) * distance + width / 2,
                        centerY: Math.sin(t) * distance + height / 2,
                        radius: radius
                    }
                )
            );
        }
    }

    const t = await Promise.allSettled(promises).then(() => cv.toBuffer());
    return t;
};
