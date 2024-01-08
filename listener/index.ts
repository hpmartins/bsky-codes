import 'module-alias/register';
import 'dotenv/config';
import { createServer } from 'http';
import express from 'express';
import { Server as SocketServer } from 'socket.io';
import { collectDefaultMetrics, register } from 'prom-client';
import { maybeBoolean, maybeInt, maybeStr } from '../common';
import { connectDb } from '../common/db';
import { FirehoseWorker } from './subscription';

export type AppContext = {
  cfg: Config;
  io: SocketServer;
  log: (text: string) => void;
};

export type Config = {
  devel: boolean;
  port: number;
  listenhost: string;
  subscriptionEndpoint: string;
  subscriptionReconnectDelay: number;
};

const cfg: Config = {
  devel: maybeBoolean(process.env.DEVEL) ?? true,
  port: maybeInt(process.env.LISTENER_PORT) ?? 6002,
  listenhost: maybeStr(process.env.LISTENER_HOST) ?? 'localhost',
  subscriptionEndpoint: maybeStr(process.env.LISTENER_FIREHOSE_ENDPOINT) ?? 'wss://bsky.network',
  subscriptionReconnectDelay: maybeInt(process.env.LISTENER_FIREHOSE_RECONNECT_DELAY) ?? 3000
};

const run = async () => {
  collectDefaultMetrics();

  const app = express();
  const httpServer = createServer(app);
  const io = new SocketServer(httpServer);

  const log = (text: string) => {
    console.log(`[${new Date().toLocaleTimeString()}] [listener] ${text}`);
  };

  const ctx: AppContext = {
    cfg,
    io,
    log
  };

  const firehose = new FirehoseWorker(ctx);

  app.get('/metrics', async (_req, res) => {
    try {
      res.set('Content-Type', register.contentType);
      res.end(await register.metrics());
    } catch (err) {
      res.status(500).end(err);
    }
  });

  await connectDb();
  firehose.run(cfg.subscriptionReconnectDelay);
  httpServer.listen(cfg.port, cfg.listenhost);

  console.log(`[${new Date().toLocaleTimeString()}] [listener] broadcasting @ ${cfg.listenhost}:${cfg.port}`);
};

run();
