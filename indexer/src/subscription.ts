import { Subscription } from '@atproto/xrpc-server'
import { cborToLexRecord, readCar } from '@atproto/repo'
import { BlobRef } from '@atproto/lexicon'
import { ids, lexicons } from '../../lexicon/lexicons'
import { Record as ProfileRecord } from '../../lexicon/types/app/bsky/actor/profile'
import { Record as GeneratorRecord } from '../../lexicon/types/app/bsky/feed/generator'
import { Record as PostRecord } from '../../lexicon/types/app/bsky/feed/post'
import { Record as RepostRecord } from '../../lexicon/types/app/bsky/feed/repost'
import { Record as LikeRecord } from '../../lexicon/types/app/bsky/feed/like'
import { Record as FollowRecord } from '../../lexicon/types/app/bsky/graph/follow'
import { Record as BlockRecord } from '../../lexicon/types/app/bsky/graph/block'
import { Record as ListRecord } from '../../lexicon/types/app/bsky/graph/list'
import { Record as ListItemRecord } from '../../lexicon/types/app/bsky/graph/listitem'
import {
  Commit,
  OutputSchema as RepoEvent,
  isCommit,
} from '../../lexicon/types/com/atproto/sync/subscribeRepos'
import { AppContext } from './index'
import client from 'prom-client'
import { SubState } from '../../common'

const firehoseMetric = new client.Counter({
  name: 'app_firehose',
  help: 'app_firehose',
  labelNames: ['action', 'collection'],
})

export abstract class FirehoseSubscriptionBase {
  public sub: Subscription<RepoEvent>
  public service: string

  constructor(public ctx: AppContext) {
    this.service = ctx.cfg.subscriptionEndpoint
    this.sub = new Subscription({
      service: ctx.cfg.subscriptionEndpoint,
      method: ids.ComAtprotoSyncSubscribeRepos,
      getParams: () => this.getCursor(),
      validate: (value: unknown) => {
        try {
          return lexicons.assertValidXrpcMessage<RepoEvent>(
            ids.ComAtprotoSyncSubscribeRepos,
            value,
          )
        } catch (err) {
          console.error('repo subscription skipped invalid message', err)
        }
      },
    })
  }

  abstract handleEvent(evt: RepoEvent): Promise<void>

  async run(subscriptionReconnectDelay: number) {
    try {
      for await (const evt of this.sub) {
        try {
          await this.handleEvent(evt)
        } catch (err) {
          console.error('repo subscription could not handle message', err)
        }
        // update stored cursor every 20 events or so
        if (isCommit(evt) && evt.seq % 20 === 0) {
          await this.updateCursor(evt.seq)
        }
      }
    } catch (err) {
      console.error('repo subscription errored', err)
      setTimeout(
        () => this.run(subscriptionReconnectDelay),
        subscriptionReconnectDelay,
      )
    }
  }

  async updateCursor(cursor: number) {
    await SubState.updateOne(
      { service: this.service },
      { cursor: cursor },
      { upsert: true }
    );
  }

  async getCursor(): Promise<{ cursor?: number }> {
    const res = await SubState.findOne({ service: this.service }, 'cursor').exec()
    return res ? { cursor: res.cursor } : {}
  }
}

export const getOpsByType = async (evt: Commit): Promise<OperationsByType> => {
  const car = await readCar(evt.blocks)
  const opsByType: OperationsByType = {
    profiles: { creates: [], updates: [], deletes: [] },
    feedgens: { creates: [], updates: [], deletes: [] },
    posts: { creates: [], deletes: [] },
    reposts: { creates: [], deletes: [] },
    likes: { creates: [], deletes: [] },
    follows: { creates: [], deletes: [] },
    blocks: { creates: [], deletes: [] },
    lists: { creates: [], updates: [], deletes: [] },
    listitems: { creates: [], deletes: [] },
  }

  for (const op of evt.ops) {
    const uri = `at://${evt.repo}/${op.path}`
    const [collection] = op.path.split('/')

    try {
      firehoseMetric.labels({ action: op.action, collection: collection }).inc()
    } catch (e: any) {
      console.log(`${op.action}(${collection})`)
    }

    if (op.action === 'update') {
      if (!op.cid) continue
      const recordBytes = car.blocks.get(op.cid)
      if (!recordBytes) continue
      const record = cborToLexRecord(recordBytes)
      const update = { uri, cid: op.cid.toString(), author: evt.repo }
      if (collection === ids.AppBskyActorProfile && isProfile(record)) {
        opsByType.profiles.updates?.push({ record, ...update })
      } else if (collection === ids.AppBskyGraphList && isList(record)) {
        opsByType.lists.updates?.push({ record, ...update })
      } else if (collection === ids.AppBskyFeedGenerator && isFeedGenerator(record)) {
        opsByType.feedgens.updates?.push({ record, ...update })
      } else {
        console.log(`################# ${collection}`)
      }
    }

    if (op.action === 'create') {
      if (!op.cid) continue
      const recordBytes = car.blocks.get(op.cid)
      if (!recordBytes) continue
      const record = cborToLexRecord(recordBytes)
      const create = { uri, cid: op.cid.toString(), author: evt.repo }
      if (collection === ids.AppBskyFeedPost && isPost(record)) {
        opsByType.posts.creates.push({ record, ...create })
      } else if (collection === ids.AppBskyFeedRepost && isRepost(record)) {
        opsByType.reposts.creates.push({ record, ...create })
      } else if (collection === ids.AppBskyFeedLike && isLike(record)) {
        opsByType.likes.creates.push({ record, ...create })
      } else if (collection === ids.AppBskyGraphFollow && isFollow(record)) {
        opsByType.follows.creates.push({ record, ...create })
      } else if (collection === ids.AppBskyGraphBlock && isBlock(record)) {
        opsByType.blocks.creates.push({ record, ...create })
      } else if (collection === ids.AppBskyActorProfile && isProfile(record)) {
        opsByType.profiles.creates.push({ record, ...create })
      } else if (collection === ids.AppBskyFeedGenerator && isFeedGenerator(record)) {
        opsByType.feedgens.creates.push({ record, ...create })
      } else if (collection === ids.AppBskyGraphList && isList(record)) {
        opsByType.lists.creates.push({ record, ...create })
      } else if (collection === ids.AppBskyGraphListitem && isListItem(record)) {
        opsByType.listitems.creates.push({ record, ...create })
      }
    }

    if (op.action === 'delete') {
      if (collection === ids.AppBskyFeedPost) {
        opsByType.posts.deletes.push({ uri })
      } else if (collection === ids.AppBskyFeedRepost) {
        opsByType.reposts.deletes.push({ uri })
      } else if (collection === ids.AppBskyFeedLike) {
        opsByType.likes.deletes.push({ uri })
      } else if (collection === ids.AppBskyGraphFollow) {
        opsByType.follows.deletes.push({ uri })
      } else if (collection === ids.AppBskyGraphBlock) {
        opsByType.blocks.deletes.push({ uri })
      } else if (collection === ids.AppBskyActorProfile) {
        opsByType.profiles.deletes.push({ uri })
      } else if (collection === ids.AppBskyFeedGenerator) {
        opsByType.feedgens.deletes.push({ uri })
      } else if (collection === ids.AppBskyGraphList) {
        opsByType.lists.deletes.push({ uri })
      } else if (collection === ids.AppBskyGraphListitem) {
        opsByType.listitems.deletes.push({ uri })
      }
    }
  }

  return opsByType
}

type OperationsByType = {
  profiles: Operations<ProfileRecord>
  feedgens: Operations<GeneratorRecord>
  posts: Operations<PostRecord>
  reposts: Operations<RepostRecord>
  likes: Operations<LikeRecord>
  follows: Operations<FollowRecord>
  blocks: Operations<BlockRecord>
  lists: Operations<ListRecord>
  listitems: Operations<ListItemRecord>
}

type Operations<T = Record<string, unknown>> = {
  creates: CreateOp<T>[]
  updates?: UpdateOp<T>[]
  deletes: DeleteOp[]
}

type CreateOp<T> = {
  uri: string
  cid: string
  author: string
  record: T
}

type UpdateOp<T> = {
  uri: string
  cid: string
  author: string
  record: T
}

type DeleteOp = {
  uri: string
}

export const isProfile = (obj: unknown): obj is ProfileRecord => {
  return isType(obj, ids.AppBskyActorProfile)
}

export const isFeedGenerator = (obj: unknown): obj is GeneratorRecord => {
  return isType(obj, ids.AppBskyFeedGenerator)
}

export const isPost = (obj: unknown): obj is PostRecord => {
  return isType(obj, ids.AppBskyFeedPost)
}

export const isRepost = (obj: unknown): obj is RepostRecord => {
  return isType(obj, ids.AppBskyFeedRepost)
}

export const isLike = (obj: unknown): obj is LikeRecord => {
  return isType(obj, ids.AppBskyFeedLike)
}

export const isFollow = (obj: unknown): obj is FollowRecord => {
  return isType(obj, ids.AppBskyGraphFollow)
}

export const isBlock = (obj: unknown): obj is BlockRecord => {
  return isType(obj, ids.AppBskyGraphBlock)
}

export const isList = (obj: unknown): obj is ListRecord => {
  return isType(obj, ids.AppBskyGraphList)
}

export const isListItem = (obj: unknown): obj is ListItemRecord => {
  return isType(obj, ids.AppBskyGraphListitem)
}

const isType = (obj: unknown, nsid: string) => {
  try {
    lexicons.assertValidRecord(nsid, fixBlobRefs(obj))
    return true
  } catch (err) {
    return false
  }
}

// @TODO right now record validation fails on BlobRefs
// simply because multiple packages have their own copy
// of the BlobRef class, causing instanceof checks to fail.
// This is a temporary solution.
const fixBlobRefs = (obj: unknown): unknown => {
  if (Array.isArray(obj)) {
    return obj.map(fixBlobRefs)
  }
  if (obj && typeof obj === 'object') {
    if (obj.constructor.name === 'BlobRef') {
      const blob = obj as BlobRef
      return new BlobRef(blob.ref, blob.mimeType, blob.size, blob.original)
    }
    return Object.entries(obj).reduce((acc, [key, val]) => {
      return Object.assign(acc, { [key]: fixBlobRefs(val) })
    }, {} as Record<string, unknown>)
  }
  return obj
}
