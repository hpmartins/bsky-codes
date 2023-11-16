import 'module-alias/register';
import 'dotenv/config';
import { Manager } from 'socket.io-client';
import { IPost, connectDb } from '../common/db';
import { FirehoseData } from '../common/types';
import { maybeInt, maybeStr } from '../common';
import { BskyAgent } from '@atproto/api';
import redis, { createClient } from 'redis';

type AppConfig = {
    bskyDid: string;
    bskyPwd: string;
    redisHost: string;
    redisPort: number;
};

export type AppContext = {
    cfg: AppConfig;
    api: BskyAgent;
    cache: redis.RedisClientType<any, any, any>;
    log: (text: string) => void;
};

async function processInteractionThread(ctx: AppContext, post: IPost) {}

export async function processFirehoseStream(ctx: AppContext, data: FirehoseData) {
    const { repo, posts, likes } = data;

    if (posts.create.length > 0) {
        for (const post of posts.create) {
            if (post.text.toLowerCase().includes('!test123')) {
                console.log(post);
            }
        }
    }
}

const run = async () => {
    await connectDb();

    const hostname = maybeStr(process.env.LISTENER_HOST) ?? 'localhost';
    const port = maybeInt(process.env.LISTENER_PORT) ?? 6002;
    const manager = new Manager(`ws://${hostname}:${port}`);
    const socket = manager.socket('/');
    socket.on('connect', () => {
        log('connected to listener');
    });
    socket.io.on('reconnect', (attempt: number) => {
        log(`reconnected to listener [${attempt}]`);
    });
    socket.io.on('reconnect_attempt', (attempt: number) => {
        log(`reconnecting to listener... [${attempt}]`);
    });

    const cfg = {
        bskyDid: maybeStr(process.env.LUNA_BSKY_DID) ?? '',
        bskyPwd: maybeStr(process.env.LUNA_BSKY_PASSWORD) ?? '',
        redisHost: maybeStr(process.env.REDIS_HOST) ?? 'localhost',
        redisPort: maybeInt(process.env.REDIS_PORT) ?? 6379
    };

    const log = (text: string) => {
        console.log(`[${new Date().toLocaleTimeString()}] [tasker] ${text}`);
    };

    const api = new BskyAgent({ service: 'https://bsky.social/' });
    await api.login({ identifier: cfg.bskyDid, password: cfg.bskyPwd });

    const cache = await createClient()
        .on('error', (err) => log(`redis error: ${err}`))
        .on('connect', () => log('connected to redis'))
        .connect();

    const ctx: AppContext = {
        cfg,
        api,
        cache,
        log
    };

    socket.on('data', async (data: FirehoseData): Promise<void> => {
        try {
            await processFirehoseStream(ctx, data);
        } catch (e) {
            log('Error');
            console.log(data);
            console.log(e);
        }
    });

    console.log(`[${new Date().toLocaleTimeString()}] [replier] started`);
};

run();
