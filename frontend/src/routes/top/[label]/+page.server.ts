import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { TopBlocked, type ITopBlocked, TopPosters } from '@common/db';
import dayjs from 'dayjs';

export const load: PageServerLoad = async ({ params }) => {
  if (params.label === 'blocked') {
    const [ list ] = await TopBlocked.aggregate()
      .match({ _id: { $gt: dayjs().subtract(24, 'hour').toDate() } })
      .sort({ _id: -1 })
      .limit(1)
      .unwind('table')
      .lookup({
        from: 'profiles',
        localField: 'table._id',
        foreignField: '_id',
        as: 'profile'
      })
      .unwind('profile')
      .group({
        _id: '$_id',
        table: { $push: {
            _id: '$table._id',
            count: '$table.count',
            profile: {
                handle: '$profile.handle',
                displayName: '$profile.displayName',
                avatar: '$profile.avatar'
            }
        } }
      });
      
      return {
        type: params.label,
        date: list._id,
        list: list.table.map((x: object, idx: number) => ({idx: idx+1, ...x}))
      }
    } else if (params.label === 'posters') {
        const [ list ] = await TopPosters.aggregate()
        .match({ _id: { $gt: dayjs().subtract(24, 'hour').toDate() } })
        .sort({ _id: -1 })
        .limit(1)
        .unwind('table')
        .lookup({
          from: 'profiles',
          localField: 'table._id',
          foreignField: '_id',
          as: 'profile'
        })
        .unwind('profile')
        .group({
          _id: '$_id',
          table: { $push: {
              _id: '$table._id',
              count: '$table.count',
              characters: '$table.characters',
              likes: '$table.likes',
              replies: '$table.replies',
              reposts: '$table.reposts',
              profile: {
                  handle: '$profile.handle',
                  displayName: '$profile.displayName',
                  avatar: '$profile.avatar'
              }
          } }
        });

        return {
          type: params.label,
          date: list._id,
          list: list.table.map((x: object, idx: number) => ({idx: idx+1, ...x}))
        }
  } else {
    throw error(404, 'not found');
  }
};
