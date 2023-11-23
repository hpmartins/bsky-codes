import { PostersByLanguage } from '@common/db';
import type { PageServerLoad } from './$types';
import dayjs from 'dayjs';
import { LANGUAGES_MAP_CODE2 } from '$lib/languages';

export const load: PageServerLoad = async ({ params }) => {
  const totals: {
    _id: string;
    count: number;
    list: {
      _id: Date;
      count: number;
    }[];
  }[] = await PostersByLanguage.aggregate()
    .match({ '_id.date': { $gte: dayjs().subtract(7, 'days').startOf('day').toDate() } })
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
      list: {
        $push: {
          _id: '$_id.date',
          count: '$count',
        },
      },
    })
    .sort({ count: 'desc' });

  const table = totals.map((x, idx) => ({
    idx: idx + 1,
    lang: x._id,
    langName: x._id in LANGUAGES_MAP_CODE2 ? LANGUAGES_MAP_CODE2[x._id].name.split(';')[0] : '',
    count: x.count,
  }));

  return {
    traces: totals.slice(0, 10).map((x, idx) => {
      return {
        name: x._id ?? 'none',
        customdata: x._id ?? 'none',
        x: x.list.map((v) => v._id),
        y: x.list.map((v) => v.count),
        yaxis: `y${idx > 0 ? idx + 1 : ''}`,
        hovertemplate: '<b>%{x}</b><br>Count: <b>%{y}</b><br>',
      };
    }),
    table: table,
  };
};
