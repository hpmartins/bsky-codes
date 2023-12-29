import { IProfile, IBlock, IFollow, ILike, IRepost, IList, IListItem, IPost, IFeedGen } from '../common/db';

export type SimpleProfileType = {
  did: string;
  avatar: string | undefined;
  displayName: string | undefined;
  handle: string;
};

export type InteractionsType = {
  _id: string;
  idx?: number;
  blocked: boolean;
  characters: number;
  replies: number;
  likes: number;
  reposts: number;
  total: number;
  points: number;
  profile: SimpleProfileType;
};

type IDelete = {
  uri: string;
};

export type FirehoseData = {
  repo: string;

  profiles: {
    create: IProfile[];
    delete: IDelete[];
    update: IProfile[];
  };
  feedgens: {
    create: IFeedGen[];
    delete: IDelete[];
    update: IFeedGen[];
  };
  posts: {
    create: IPost[];
    delete: IDelete[];
    update: IPost[];
  };
  blocks: {
    create: IBlock[];
    delete: IDelete[];
  };
  follows: {
    create: IFollow[];
    delete: IDelete[];
  };
  likes: {
    create: ILike[];
    delete: IDelete[];
  };
  reposts: {
    create: IRepost[];
    delete: IDelete[];
  };
  lists: {
    create: IList[];
    delete: IDelete[];
    update: IList[];
  };
  listitems: {
    create: IListItem[];
    delete: IDelete[];
  };
};
