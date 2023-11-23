import mongoose, { Schema } from 'mongoose';

// Profiles
export interface IProfile {
  _id: string;
  handle: string;
  displayName: string;
  avatar: string;
  description: string;
  indexedAt: string;
  lastProfileUpdateAt: string;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
}

const profileSchema = new Schema<IProfile>(
  {
    _id: String,
    handle: String,
    displayName: String,
    avatar: String,
    description: String,
    indexedAt: Date,
    lastProfileUpdateAt: Date,
    deleted: { type: Boolean, default: false }
  },
  { timestamps: true }
);

// Posts
export interface IPost {
  _id: string;
  cid: string;
  author: string;
  text: string;
  replyParent: string | null;
  replyRoot: string | null;
  quoteUri: string | null;
  langs: string[];
  hasImages: number;
  altText: string[];
  textLength: number | null;
  comments: number | null;
  reposts: number | null;
  likes: number | null;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
}

const postSchema = new Schema<IPost>(
  {
    _id: String,
    cid: String,
    author: { type: String, ref: 'Profile' },
    text: String,
    replyParent: { type: String, ref: 'Post' },
    replyRoot: { type: String, ref: 'Post' },
    quoteUri: { type: String, ref: 'Post' },
    langs: [String],
    hasImages: Number,
    altText: [String],
    textLength: Number,
    comments: Number,
    reposts: Number,
    likes: Number,
    deleted: { type: Boolean, default: false }
  },
  { timestamps: true }
);

// Follows
export interface IFollow {
  _id: string;
  author: string;
  subject: string;
  createdAt: string;
  updatedAt: string;
}
const followSchema = new Schema<IFollow>(
  {
    _id: String,
    author: { type: String, ref: 'Profile' },
    subject: { type: String, ref: 'Profile' }
  },
  { timestamps: true, expires: '3d' }
);

// Likes
export interface ILike {
  _id: string;
  author: string;
  subject: string;
  subjectUri: string;
  createdAt: string;
  updatedAt: string;
}
const likeSchema = new Schema<ILike>(
  {
    _id: String,
    author: { type: String, ref: 'Profile' },
    subject: { type: String, ref: 'Profile' },
    subjectUri: { type: String, ref: 'Post' }
  },
  { timestamps: true, expires: '3d' }
);

// Reposts
export interface IRepost {
  _id: string;
  author: string;
  subject: string;
  subjectUri: string;
  createdAt: string;
  updatedAt: string;
}
const repostSchema = new Schema<IRepost>(
  {
    _id: String,
    author: { type: String, ref: 'Profile' },
    subject: { type: String, ref: 'Profile' },
    subjectUri: { type: String, ref: 'Post' }
  },
  { timestamps: true }
);

// Blocks
export interface IBlock {
  _id: string;
  author: string;
  subject: string;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
}

const blockSchema = new Schema<IBlock>(
  {
    _id: String,
    author: { type: String, ref: 'Profile' },
    subject: { type: String, ref: 'Profile' },
    deleted: { type: Boolean, default: false }
  },
  { timestamps: true }
);

// Feed generators
export interface IFeedGen {
  _id: string;
  author: string;
  name: string;
  feedDid: string;
  description: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

const feedGenSchema = new Schema<IFeedGen>(
  {
    _id: String,
    author: { type: String, ref: 'Profile' },
    name: String,
    feedDid: String,
    description: String,
    displayName: String
  },
  { timestamps: true }
);

// Lists
export interface IList {
  _id: string;
  author: string;
  name: string;
  purpose: string;
  description: string | null;
  items: IListItem[];
  createdAt: string;
  updatedAt: string;
}

export interface IListItem {
  _id: string;
  list: string;
  subject: string;
  createdAt: string;
  updatedAt: string;
}

const listItemSchema = new Schema<IListItem>(
  {
    _id: String,
    list: { type: String, ref: 'List' },
    subject: { type: String, ref: 'Profile' }
  },
  { timestamps: true }
);

const listSchema = new Schema<IList>(
  {
    _id: String,
    author: { type: String, ref: 'Profile' },
    name: String,
    purpose: String,
    description: String,
    items: [listItemSchema]
  },
  { timestamps: true }
);

// Interactions
interface IInteractionList {
  _id: Date;
  characters: number;
  replies: number;
  likes: number;
  reposts: number;
}

interface IInteraction {
  _id: {
    author: string;
    subject: string;
  };
  list: IInteractionList[];
}

const interactionListSchema = new Schema<IInteractionList>({
  _id: Date,
  characters: { type: Number, default: 0 },
  replies: { type: Number, default: 0 },
  likes: { type: Number, default: 0 },
  reposts: { type: Number, default: 0 }
});

const interactionSchema = new Schema<IInteraction>({
  _id: {
    author: { type: String, ref: 'Profile' },
    subject: { type: String, ref: 'Profile' }
  },
  list: [interactionListSchema]
});

// Subscription state
interface ISubState {
  service: string;
  cursor: number;
}

const subStateSchema = new Schema<ISubState>({
  service: String,
  cursor: Number
});

// Sync state
interface ISyncState {
  _id: string;
  repoCursor: string | undefined;
  repoIndex: number;
  repoDid: string;
  col: string;
  colCursor: string;
}

const syncStateSchema = new Schema<ISyncState>({
  _id: String,
  repoCursor: String,
  repoIndex: Number,
  repoDid: String,
  col: String,
  colCursor: String
});

// Sync profile
interface ISyncProfileState {
  _id: string;
  updated: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const syncProfileSchema = new Schema<ISyncProfileState>(
  {
    _id: String,
    status: String,
    updated: Boolean
  },
  { timestamps: true }
);

// DerivedData
export interface ITopBlocked {
  _id: Date;
  table: {
    _id: string;
    count: number;
  }[]
}
export interface ITopPosters {
  _id: Date;
  table: {
    _id: string;
    count: number;
    characters: number;
    likes: number;
    replies: number;
    reposts: number;
  }[]
}

export const DerivedData = mongoose.models['DerivedData'] || mongoose.model('DerivedData', new Schema({ _id: Date }, { discriminatorKey: 'kind', collection: 'derived_data' }));
export const TopBlocked = mongoose.models['TopBlocked'] || DerivedData.discriminator<ITopBlocked>('TopBlocked', new Schema({
  table: [{
    _id: { type: 'String', ref: 'Profile' },
    count: Number
  }]
}));
export const TopPosters = mongoose.models['TopPosters'] || DerivedData.discriminator<ITopPosters>('TopPosters', new Schema({
  table: [{
    _id: { type: 'String', ref: 'Profile' },
    count: Number,
    characters: Number,
    likes: Number,
    replies: Number,
    reposts: Number,
  }]
}));

// Data histogram
export interface IDataHistogram {
  _id: Date;
  profiles: number;
  blocks: number;
  blocks_deleted: number;
  follows: number;
  likes: number;
  reposts: number;
  posts: number;
  posts_deleted: number;
  characters: number;
  images: number;
  imagesWithAltText: number;
}
const dataHistogramSchema = new Schema ({
  _id: Date,
  profiles: Number,
  blocks: Number,
  blocks_deleted: Number,
  follows: Number,
  likes: Number,
  reposts: Number,
  posts: Number,
  posts_deleted: Number,
  characters: Number,
  images: Number,
  imagesWithAltText: Number,
}, { collection: 'data_histogram' })
export const DataHistogram = mongoose.models['DataHistogram'] || mongoose.model<IDataHistogram>('DataHistogram', dataHistogramSchema);

export interface IPostersByLanguage {
  _id: {
    date: Date;
    lang: string;
  }
  total: {
    count: number;
    characters: number;
    likes: number;
    replies: number;
    reposts: number;
  }
  people: {
      _id: string;
      count: number;
      characters: number;
      likes: number;
      replies: number;
      reposts: number;
  }[]
}
const postersByLanguageSchema = new Schema<IPostersByLanguage>({
  _id: {
    date: String,
    lang: String,
  },
  total: {
    count: Number,
    characters: Number,
    likes: Number,
    replies: Number,
    reposts: Number,
  },
  people: [{
    _id: { type: 'String', ref: 'Profile' },
    count: Number,
    characters: Number,
    likes: Number,
    replies: Number,
    reposts: Number,
  }]
})
export const PostersByLanguage = mongoose.models['PostersByLanguage'] || mongoose.model<IPostersByLanguage>('PostersByLanguage', postersByLanguageSchema, 'languages');

// Wolfgang licks
interface IWolfgangLick {
  _id: string;
  cid: string;
  handle: string;
  points: number;
  reposted: boolean;
  postedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const wolfgangLickSchema = new Schema<IWolfgangLick>({
  _id: { type: String, ref: 'Post' },
  cid: String,
  handle: String,
  points: Number,
  reposted: { type: Boolean, default: false },
  postedAt: Date,
}, { timestamps: true })

// Models
export const Profile = mongoose.models['Profile'] || mongoose.model<IProfile>('Profile', profileSchema);
export const Follow = mongoose.models['Follow'] || mongoose.model<IFollow>('Follow', followSchema);
export const Post = mongoose.models['Post'] || mongoose.model<IPost>('Post', postSchema);
export const Like = mongoose.models['Like'] || mongoose.model<ILike>('Like', likeSchema);
export const Repost = mongoose.models['Repost'] || mongoose.model<IRepost>('Repost', repostSchema);
export const Block = mongoose.models['Block'] || mongoose.model<IBlock>('Block', blockSchema);
export const FeedGen = mongoose.models['FeedGen'] || mongoose.model<IFeedGen>('FeedGen', feedGenSchema);
export const List = mongoose.models['List'] || mongoose.model<IList>('List', listSchema);

export const Interaction = mongoose.models['Interaction'] || mongoose.model<IInteraction>('Interaction', interactionSchema);

export const SubState = mongoose.models['SubState'] || mongoose.model<ISubState>('SubState', subStateSchema);

export const SyncState = mongoose.models['SyncState'] || mongoose.model<ISyncState>('SyncState', syncStateSchema);
export const SyncProfile = mongoose.models['SyncStateProfile'] || mongoose.model<ISyncProfileState>('SyncStateProfile', syncProfileSchema);

export const WolfgangLick = mongoose.models['WolfgangLick'] || mongoose.model<IWolfgangLick>('WolfgangLick', wolfgangLickSchema, 'wolfgang_licks');
