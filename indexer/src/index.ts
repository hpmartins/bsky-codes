import http from 'http'
import events from 'events'
import express from 'express'
import { BskyAgent } from '@atproto/api'
import { DidResolver, MemoryCache } from '@atproto/did-resolver'
import NodeCache  from 'node-cache'
import { collectDefaultMetrics, register } from 'prom-client';
import { FirehoseWorker } from './worker'
import dotenv from 'dotenv'

export const SECOND = 1000
export const MINUTE = SECOND * 60
export const HOUR = MINUTE * 60
export const DAY = HOUR * 24
export const WEEK = DAY * 7

import { maybeInt, maybeBoolean, maybeStr, connectDb } from '../../common'

export type AppContext = {
  cfg: Config
  api: BskyAgent
  cache: NodeCache
  didResolver: DidResolver
  log: (text: string) => void
}

export type Config = {
  devel: boolean
  port: number
  listenhost: string
  hostname: string
  sqliteLocation: string
  bskyIdentifier: string
  bskyPassword: string
  firehoseConnect: boolean
  databaseString: string
  subscriptionEndpoint: string
  subscriptionReconnectDelay: number
}

export class Indexer {
  public app: express.Application
  public server?: http.Server
  public firehose: FirehoseWorker
  public cfg: Config
  public api: BskyAgent

  constructor(
    app: express.Application,
    firehose: FirehoseWorker,
    cfg: Config,
    api: BskyAgent,
  ) {
    this.app = app
    this.firehose = firehose
    this.cfg = cfg
    this.api = api
  }

  static create(cfg: Config) {
    collectDefaultMetrics()

    const app = express()
    const api = new BskyAgent({ service: 'https://bsky.social' })
    const didCache = new MemoryCache()
    const didResolver = new DidResolver(
      { plcUrl: 'https://plc.directory' },
      didCache,
    )
    const cache = new NodeCache({ stdTTL: 24*HOUR/1000 })

    const log = (text: string) => {
      console.log(`[${new Date().toLocaleTimeString()}] ${text}`)
    }

    const ctx: AppContext = {
      // db,
      cfg,
      api,
      cache,
      didResolver,
      log,
    }

    const firehose = new FirehoseWorker(ctx)

    app.get('/metrics', async (_req, res) => {
      try {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
      } catch (err) {
        res.status(500).end(err);
      }
    });

    return new Indexer(app, firehose, cfg, api)
  }

  async start(): Promise<http.Server> {
    await connectDb()
    if (this.cfg.firehoseConnect) {
      await this.api.login({
        identifier: this.cfg.bskyIdentifier,
        password: this.cfg.bskyPassword,
      })
      this.firehose.run(this.cfg.subscriptionReconnectDelay)
    }
    this.server = this.app.listen(this.cfg.port, this.cfg.listenhost)
    await events.once(this.server, 'listening')
    return this.server
  }
}

const run = async () => {
  dotenv.config()
  console.log(process.env)
  const hostname = maybeStr(process.env.APP_HOSTNAME) ?? 'example.com'
  const server = Indexer.create({
    devel: !!maybeInt(process.env.APP_DEVEL) ?? true,
    port: maybeInt(process.env.APP_PORT) ?? 3000,
    listenhost: maybeStr(process.env.APP_LISTENHOST) ?? 'localhost',
    sqliteLocation: maybeStr(process.env.APP_SQLITE_LOCATION) ?? ':memory:',
    bskyIdentifier: maybeStr(process.env.APP_BSKY_IDENTIFIER) ?? '',
    bskyPassword: maybeStr(process.env.APP_BSKY_PASSWORD) ?? '',
    firehoseConnect: maybeBoolean(process.env.APP_FIREHOSE_CONNECT) ?? false,
    databaseString: maybeStr(process.env.APP_DB_CONN_STRING) ?? '',
    subscriptionEndpoint:
      maybeStr(process.env.APP_SUBSCRIPTION_ENDPOINT) ??
      'wss://bsky.network',
    subscriptionReconnectDelay:
      maybeInt(process.env.APP_SUBSCRIPTION_RECONNECT_DELAY) ?? 3000,
    hostname,
  })
  await server.start()
  console.log(
    `[indexer] listening at http://${server.cfg.listenhost}:${server.cfg.port}`,
  )
}

run()
