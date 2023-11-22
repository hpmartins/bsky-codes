import { PostersByLanguage } from '@common/db';
import type { PageServerLoad } from './$types';
import dayjs from 'dayjs';

export const load: PageServerLoad = async () => {
  const totals: {
    _id: string;
    count: number;
    list: {
      _id: Date;
      count: number;
    }[];
  }[] = await PostersByLanguage.aggregate()
  .match({ '_id.date': { $gte: dayjs().subtract(7, 'days').startOf('day').toDate() }})
  .match({ '_id.date': { $lt: dayjs().startOf('hour').toDate() }})
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
      list: {
        $push: {
          _id: '$_id.date',
          count: '$count',
        },
      },
    })
    .sort({ count: 'desc' });

  return {
    totals: totals,
  };
};
