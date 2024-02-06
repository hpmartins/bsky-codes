import type { PageServerLoad } from './$types';
import { PostersByLanguage, TopPosters } from '@common/db';
import dayjs from 'dayjs';

const getLangs = async () => {
    const langs: {
        _id: string;
        count: number;
    }[] = await PostersByLanguage.aggregate()
        .match({ '_id.date': { $gte: dayjs().subtract(3, 'days').startOf('day').toDate() } })
        .match({ '_id.date': { $lt: dayjs().startOf('hour').toDate() } })
        .project({
            people: 0,
        })
        .project({
            count: '$total.count',
        })
        .sort({ '_id.date': 'desc' })
        .group({
            _id: '$_id.lang',
            count: { $sum: '$count' },
        })
        .sort({ count: 'desc' });

    return langs.length > 0 ? langs : undefined;
};

const getTopPosters = async () => {
    const posters: {
        _id: Date;
        table: {
            _id: string;
            count: number;
            characters: number;
            likes: number;
            replies: number;
            reposts: number;
            profile: {
                handle: string;
                displayName: string;
                avatar: string;
            };
        }[];
    }[] = await TopPosters.aggregate()
        .match({ _id: { $gt: dayjs().subtract(24, 'hour').toDate() } })
        .sort({ _id: -1 })
        .limit(1)
        .unwind('table')
        .lookup({
            from: 'profiles',
            localField: 'table._id',
            foreignField: '_id',
            as: 'profile',
        })
        .unwind('profile')
        .group({
            _id: '$_id',
            table: {
                $push: {
                    _id: '$table._id',
                    count: '$table.count',
                    characters: '$table.characters',
                    likes: '$table.likes',
                    replies: '$table.replies',
                    reposts: '$table.reposts',
                    profile: {
                        handle: '$profile.handle',
                        displayName: '$profile.displayName',
                        avatar: '$profile.avatar',
                    },
                },
            },
        });

    return posters.length > 0 ? posters[0].table : undefined;
};

const getTopPostersByLang = async (lang: string) => {
    const posters: {
        _id: string;
        count: number;
        characters: number;
        likes: number;
        replies: number;
        reposts: number;
        profile: {
            handle: string;
            displayName: string;
            avatar: string;
        };
    }[] = await PostersByLanguage.aggregate()
        .match({ '_id.lang': lang === 'none' ? null : lang })
        .match({ '_id.date': { $gte: dayjs().subtract(3, 'days').startOf('day').toDate() } })
        .match({ '_id.date': { $lt: dayjs().startOf('hour').toDate() } })
        .project({
            people: { $firstN: { input: '$people', n: 500 } },
        })
        .unwind('$people')
        .group({
            _id: '$people._id',
            count: { $sum: '$people.count' },
            characters: { $sum: '$people.characters' },
            likes: { $sum: '$people.likes' },
            replies: { $sum: '$people.replies' },
            reposts: { $sum: '$people.reposts' },
        })
        .sort({ count: 'desc' })
        .limit(60)
        .lookup({
            from: 'profiles',
            localField: '_id',
            foreignField: '_id',
            as: 'profile',
        })
        .unwind('$profile')
        .project({
            _id: 1,
            count: 1,
            characters: 1,
            likes: 1,
            replies: 1,
            reposts: 1,
            profile: {
                avatar: 1,
                displayName: 1,
                handle: 1,
            },
        });

    return posters && posters.length > 0 ? posters : undefined;
};

export const load: PageServerLoad = async ({ params }) => {
    const langs = await getLangs();

    if (!params.lang || params.lang === 'all') {
        const posters = await getTopPosters();
        if (posters) {
            return {
                lang: 'all',
                langs: langs,
                posters: posters.map((x, idx) => ({ idx: idx + 1, ...x })),
            };
        }
    } else if (params.lang) {
        const posters = await getTopPostersByLang(params.lang);
        if (posters) {
            return {
                lang: params.lang,
                langs: langs,
                posters: posters.map((x, idx) => ({ idx: idx + 1, ...x })),
            };
        }
    }
};
