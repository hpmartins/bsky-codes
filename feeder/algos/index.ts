import { AppContext } from '../index'
import {
  QueryParams,
  OutputSchema as AlgoOutput,
} from '../../common/lexicon/types/app/bsky/feed/getFeedSkeleton'
import * as feedLangPt from './langPt'

type AlgoHandler = (ctx: AppContext, params: QueryParams) => Promise<AlgoOutput>

const algos: Record<string, AlgoHandler> = {
  [feedLangPt.shortname]: feedLangPt.handler,
}

export default algos
