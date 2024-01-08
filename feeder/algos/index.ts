import {
    QueryParams,
    OutputSchema as AlgoOutput
} from '../../common/lexicon/types/app/bsky/feed/getFeedSkeleton';
import * as feedLangPt from './langPt';
import * as feedBBB from './bbb';

type AlgoHandler = (params: QueryParams) => Promise<AlgoOutput>;

const algos: Record<string, AlgoHandler> = {
    [feedLangPt.shortname]: feedLangPt.handler,
    [feedBBB.shortname]: feedBBB.handler,
};

export default algos;
