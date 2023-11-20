import 'module-alias/register';
import 'dotenv/config';
import { Manager } from 'socket.io-client';
import { IPost, connectDb } from '../common/db';
import { FirehoseData } from '../common/types';
import { getCreationTimestamp, getProfile, maybeInt, maybeStr } from '../common';
import { createCirclesImage, searchInteractions } from '../common/queries/interactions';
import { AppBskyFeedPost, BskyAgent, RichText } from '@atproto/api';
import redis, { createClient } from 'redis';
import dayjs from 'dayjs';

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

async function processBirthday(ctx: AppContext, repo: string, post: IPost) {
    const locale = post.langs.length > 0 ? post.langs[0] : 'en';

    const ts_data = await getCreationTimestamp(repo);
    if (!ts_data) return;

    const { handle, indexedAt } = ts_data;

    let date: string;
    let text: string;
    if (locale.startsWith('pt')) {
        date = dayjs(indexedAt).format('DD/MM/YYYY [às] HH:mm:ss');
        text = `🐈‍⬛ @${handle}, sua conta foi criada em ${date}`;
    } else {
        date = dayjs(indexedAt).format('YYYY-MM-DD [at] h:mm:ss A');
        text = `🐈‍⬛ @${handle}, your account was created on ${date}`;
    }
    const postText = new RichText({
        text: text
    });
    await postText.detectFacets(ctx.api);
    const postRecord = {
        $type: 'app.bsky.feed.post',
        text: postText.text,
        reply: {
            parent: {
                uri: post._id,
                cid: post.cid
            },
            root: {
                uri: post._id,
                cid: post.cid
            }
        },
        facets: postText.facets,
        createdAt: new Date().toISOString()
    };
    await ctx.api.post(postRecord);
}

async function processBolas(ctx: AppContext, repo: string, post: IPost) {
    const locale = post.langs.length > 0 ? post.langs[0] : 'en';

    const profile = await getProfile(repo);
    if (!profile) return;
    const data = await searchInteractions({
        did: profile.did,
        handle: profile.handle,
        range: 'week'
    });
    if (!data) return;

    const stream = await createCirclesImage(
        {
            did: profile.did,
            avatar: profile.avatar,
            displayName: profile.displayName,
            handle: profile.handle
        },
        data,
        { type: 'week' },
        locale
    );

    let text: string;
    if (locale.startsWith('pt')) {
        text = `🐈‍⬛ @${profile.handle}, aqui estão suas bolas dos últimos 7 dias 🖤`;
    } else {
        text = `🐈‍⬛ @${profile.handle}, here are your circles of the last 7 days 🖤`;
    }
    const postText = new RichText({
        text: text
    });
    await postText.detectFacets(ctx.api);

    ctx.api.uploadBlob(stream, { encoding: 'image/png' }).then((res) => {
        if (res.success) {
            const postRecord = {
                $type: 'app.bsky.feed.post',
                text: postText.text,
                facets: postText.facets,
                createdAt: new Date().toISOString(),
                embed: {
                    $type: 'app.bsky.embed.images',
                    images: [{ image: res.data.blob, alt: '' }]
                },
                reply: {
                    parent: {
                        uri: post._id,
                        cid: post.cid
                    },
                    root: {
                        uri: post._id,
                        cid: post.cid
                    }
                },
            };
            if (AppBskyFeedPost.isRecord(postRecord)) {
                const val = AppBskyFeedPost.validateRecord(postRecord);
                if (val.success) {
                    ctx.api.post(postRecord);
                }
            }
        }
    });
}

export async function processFirehoseStream(ctx: AppContext, data: FirehoseData) {
    const { repo, posts } = data;

    if (posts.create.length > 0) {
        for (const post of posts.create) {
            const text = post.text.toLowerCase().trim();
            if (text.startsWith('!luna')) {
                const match = text.match(/!luna\s+(\w+)/i);
                const key = match ? match[1].toLowerCase() : undefined;
                if (!key) return;

                if (key === 'birthday') {
                    await processBirthday(ctx, repo, post);
                }

                if (key === 'bolas' || key === 'circles') {
                    await processBolas(ctx, repo, post);
                }
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
        console.log(`[${new Date().toLocaleTimeString()}] [replier] ${text}`);
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
