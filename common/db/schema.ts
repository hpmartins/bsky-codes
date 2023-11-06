export type DatabaseSchema = {
  profiles: Profile
  feedgens: FeedGenerator
  posts: Post
  blocks: Block
  custom_lists: CustomList
  follows: Follow
  likes: Like
  reposts: Repost
  lists: List
  listitems: ListItem
  licks: Lick
  circles: Circle
  derived_data: DerivedData
  lickable_people: LickablePeople
  sub_state: SubState
}

export type Profile = {
  did: string
  handle: string | null
  displayName: string | null
  avatar: string | null
  description: string | null
  indexedAt: string | null
  updatedAt: string | null
  lastActivity: string | null
}

export type FeedGenerator = {
  uri: string
  author: string
  name: string
  feedDid: string
  description: string
  displayName: string
  indexedAt: string
}

export type Post = {
  uri: string
  cid: string
  author: string
  text: string
  replyParent: string | null
  replyRoot: string | null
  quoteUri: string | null
  langs: string | null
  hasImages: number
  altText: string | null
  textLength: number | null
  comments: number | null
  reposts: number | null
  likes: number | null
  indexedAt: string
}

export type Languages = {
  [key : string] : number
}[]

export type Block = {
  uri: string
  cid: string
  author: string
  subject: string
  indexedAt: string
}

export type Follow = {
  uri: string
  cid: string
  author: string
  subject: string
  indexedAt: string
}

export type Like = {
  uri: string
  cid: string
  subjectUri: string
  subjectCid: string
  indexedAt: string
}

export type Repost = {
  uri: string
  cid: string
  subjectUri: string
  subjectCid: string
  indexedAt: string
}

export type CustomList = {
  owner: string
  type: string
  list: string
  showReplies: boolean
  showImages: boolean
  indexedAt: string
}

export type List = {
  uri: string
  cid: string
  author: string
  purpose: string
  name: string
  description: string | null
  indexedAt: string
}

export type ListItem = {
  uri: string
  cid: string
  author: string
  subject: string
  list: string
  indexedAt: string
}

export type DerivedData = {
  name: string
  data: string
  updatedAt: string
}

export type Lick = {
  uri: string
  author: string
  indexedAt: string
}

export type Circle = {
  did: string
  interactions: string
  image: Buffer | null
  updatedAt: string | null
  lastCreatedAt: string | null
}

export type LickablePeople = {
  did: string
  handle: string
}

export type SubState = {
  service: string
  cursor: number
}
