import { PostersByLanguage } from '@common/db';
import type { RequestHandler } from './$types';
import dayjs from 'dayjs';

export const POST: RequestHandler = async ({ request }) => {
  const input: {
    lang: string;
  } = await request.json();

  console.log(input.lang)

  const posters = await PostersByLanguage.aggregate()
    .match({ '_id.lang': input.lang === "none" ? null : input.lang })
    .match({ '_id.date': { $gte: dayjs().subtract(7, 'days').startOf('day').toDate() }})
    .match({ '_id.date': { $lt: dayjs().startOf('hour').toDate() }})
    .project({
        people: { $firstN: { input: "$people", n: 500 }}
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
    .limit(50)
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

  return new Response(JSON.stringify(posters.map((x, idx) => ({idx: idx+1, ...x}))));
};
