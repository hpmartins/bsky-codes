import { Manager } from "socket.io-client";
import NodeCache from "node-cache";
import 'dotenv/config'
import { connectDb } from "@common/db";
import { FirehoseData, processFirehoseStream } from "./worker";
import { maybeInt, maybeStr } from "@common";

export const SECOND = 1000;
export const MINUTE = SECOND * 60;
export const HOUR = MINUTE * 60;
export const DAY = HOUR * 24;
export const WEEK = DAY * 7;

export type AppContext = {
  cache: NodeCache;
  log: (text: string) => void;
};

const run = async () => {
  await connectDb();

  const hostname = maybeStr(process.env.LISTENER_HOST) ?? 'localhost'
  const port = maybeInt(process.env.LISTENER_PORT) ?? 6002
  const manager = new Manager(`ws://${hostname}:${port}`);
  const socket = manager.socket('/');

  const cache = new NodeCache({ stdTTL: (24 * HOUR) / 1000 });

  const log = (text: string) => {
    console.log(`[${new Date().toLocaleTimeString()}] [indexer] ${text}`);
  };

  const ctx: AppContext = {
    cache,
    log,
  };

  socket.on("connect", () => {
    log('connected to listener')
  })

  socket.io.on("reconnect", (attempt: number) => {
    log(`reconnected to listener [${attempt}]`)
  })

  socket.io.on("reconnect_attempt", (attempt: number) => {
    log(`reconnecting to listener... [${attempt}]`)
  })

  socket.on("data", async (data: FirehoseData): Promise<void> => {
    try {
      await processFirehoseStream(ctx, data);
    } catch (e) {
      log('Error')
      console.log(data)
      console.log(e)
    }
  });

  console.log(`[${new Date().toLocaleTimeString()}] [indexer] started`);
};

run();
