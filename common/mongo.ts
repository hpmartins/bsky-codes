import { Schema, model } from "mongoose";

// Profiles
interface IProfile {
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
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Posts
interface IPost {
  _id: string;
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
    author: { type: String, ref: "Profile" },
    text: String,
    replyParent: { type: String, ref: "Post" },
    replyRoot: { type: String, ref: "Post" },
    quoteUri: { type: String, ref: "Post" },
    langs: [String],
    hasImages: Number,
    altText: [String],
    textLength: Number,
    comments: Number,
    reposts: Number,
    likes: Number,
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Follows
interface IFollow {
  _id: string;
  author: string;
  subject: string;
  createdAt: string;
  updatedAt: string;
}
const followSchema = new Schema<IFollow>(
  {
    _id: String,
    author: { type: String, ref: "Profile" },
    subject: { type: String, ref: "Profile" },
  },
  { timestamps: true, expires: "3d" }
);

// Likes
interface ILike {
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
    author: { type: String, ref: "Profile" },
    subject: { type: String, ref: "Profile" },
    subjectUri: { type: String, ref: "Post" },
  },
  { timestamps: true, expires: "3d" }
);

// Reposts
interface IRepost {
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
    author: { type: String, ref: "Profile" },
    subject: { type: String, ref: "Profile" },
    subjectUri: { type: String, ref: "Post" },
  },
  { timestamps: true }
);

// Blocks
interface IBlock {
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
    author: { type: String, ref: "Profile" },
    subject: { type: String, ref: "Profile" },
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Feed generators
interface IFeedGen {
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
    author: { type: String, ref: "Profile" },
    name: String,
    feedDid: String,
    description: String,
    displayName: String,
  },
  { timestamps: true }
);

// Lists
interface IList {
  _id: string;
  author: string;
  name: string;
  purpose: string;
  description: string | null;
  items: IListItem[];
  createdAt: string;
  updatedAt: string;
}

interface IListItem {
  _id: string;
  subject: string;
  createdAt: string;
  updatedAt: string;
}

const listItemSchema = new Schema<IListItem>(
  {
    _id: String,
    subject: { type: String, ref: "Profile" },
  },
  { timestamps: true }
);

const listSchema = new Schema<IList>(
  {
    _id: String,
    author: { type: String, ref: "Profile" },
    name: String,
    purpose: String,
    description: String,
    items: [listItemSchema],
  },
  { timestamps: true }
);

// Partitions
interface ICount {
  _id: string;
  characters: number;
  replies: number;
  likes: number;
  reposts: number;
}

interface IPartitionData {
  _id: {
    day: number;
    year: number;
  };
  follows: number;
  counts: ICount[];
}

interface IPartition {
  _id: string;
  data: IPartitionData[];
}

const countSchema = new Schema<ICount>({
  _id: { type: String, ref: "Profile" },
  characters: { type: Number, default: 0 },
  replies: { type: Number, default: 0 },
  likes: { type: Number, default: 0 },
  reposts: { type: Number, default: 0 },
});

const partitionDataSchema = new Schema<IPartitionData>({
  _id: {
    day: Number,
    year: Number,
  },
  follows: Number,
  counts: [countSchema],
});

const partitionSchema = new Schema<IPartition>({
  _id: { type: String, ref: "Profile" },
  data: [partitionDataSchema],
});

// Subscription state
interface ISubState {
  service: string;
  cursor: number;
}

const subStateSchema = new Schema<ISubState>({
  service: String,
  cursor: Number,
});

// Models
export const Profile = model<IProfile>("Profile", profileSchema);
export const Follow = model<IFollow>("Follow", followSchema);
export const Post = model<IPost>("Post", postSchema);
export const Like = model<ILike>("Like", likeSchema);
export const Repost = model<IRepost>("Repost", repostSchema);
export const Block = model<IBlock>("Block", blockSchema);
export const FeedGen = model<IFeedGen>("FeedGen", feedGenSchema);
export const List = model<IList>("List", listSchema);

export const Partition = model<IPartition>("Partition", partitionSchema);

export const SubState = model<ISubState>("SubState", subStateSchema);
