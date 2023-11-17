import { Block, Interaction, Post, Profile } from '@common/db';
import type { PageServerLoad } from './$types';

const formatNumber = (s: string) => s.replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",")

export const load: PageServerLoad = async () => {
    // const query = await TopPostersByLang.aggregate()
    // .match({
    //     _id: { $gte: dayjs().subtract(3, 'day').startOf('day').toDate() }
    // })
    // .project({ _id: 0, items: 1 })
    // .unwind('$items')
    // .project({ lang: "$items._id" })

    // const langs = [...new Set(query.map(x => x.lang))]
    // console.log(langs)
//   const query = await DataHistogram.find(
//     { _id: { $gte: dayjs('2022-10-01').toDate() }}
//   )

//   return {
//     histogram: query.map(x => x.toObject()),
//   }

    const aggBlocks = await Block.aggregate( [ { $collStats: { count: {} } } ] )
    const aggPosts = await Post.aggregate( [ { $collStats: { count: {} } } ] )
    const aggInteractions = await Interaction.aggregate( [ { $collStats: { count: {} } } ] )
    const aggProfiles = await Profile.aggregate( [ { $collStats: { count: {} } } ] )

    return {
      count: {
        blocks: formatNumber(aggBlocks[0].count.toString()),
        posts: formatNumber(aggPosts[0].count.toString()),
        interactions: formatNumber(aggInteractions[0].count.toString()),
        profiles: formatNumber(aggProfiles[0].count.toString()),
    }
  }
};
