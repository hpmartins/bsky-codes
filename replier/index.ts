var cron = require('node-cron');
import 'module-alias/register';
import 'dotenv/config';
import { Manager } from 'socket.io-client';
import { connectDb } from '../common/db';
import { FirehoseData } from '../common/types';
import { maybeBoolean, maybeInt, maybeStr } from '../common';
import { AppBskyFeedPost, BskyAgent } from '@atproto/api';
import redis, { createClient } from 'redis';
import { DidResolver } from '@atproto/identity';
import {
    processWordCloud,
    processRemindMe,
    processRemindMeTask,
    processFirstPost,
    processBirthday,
    processBolas
} from './commands';

export const MINUTE = 60;
export const HOUR = MINUTE * 60;
export const DAY = HOUR * 24;
export const WEEK = DAY * 7;

type AppConfig = {
    devel: boolean;
    bskyDid: string;
    bskyPwd: string;
    redisHost: string;
    redisPort: number;
};

export type AppContext = {
    cfg: AppConfig;
    agent: BskyAgent;
    didres: DidResolver;
    cache: redis.RedisClientType<any, any, any>;
    log: (text: string) => void;
};

export const checkValidateAndPost = async (agent: BskyAgent, postRecord: unknown) => {
    if (
        AppBskyFeedPost.isRecord(postRecord) &&
        AppBskyFeedPost.validateRecord(postRecord).success
    ) {
        return await agent.post(postRecord);
    }
};

export async function processFirehoseStreamDevel(ctx: AppContext, data: FirehoseData) {
    const { repo, posts } = data;
    if (posts.create.length > 0) {
        for (const post of posts.create) {
            const text = post.text.toLowerCase().trim();
            if (text.startsWith('!luna')) {
                const match = text.match(/!luna(\s*\w+\s*)/i);
                const command = match ? match[1].toLowerCase().trim() : undefined;
                if (!match || !command) return;

                if (command === 'retrospectiva' || command === 'wrapped') {
                }
            }
        }
    }
}

export async function processFirehoseStream(ctx: AppContext, data: FirehoseData) {
    const { repo, posts } = data;

    if (posts.create.length > 0) {
        for (const post of posts.create) {
            const text = post.text.toLowerCase().trim();

            // Luna
            if (text.startsWith('!luna')) {
                const match = text.match(/!luna(\s*\w+\s*)/i);
                const command = match ? match[1].toLowerCase().trim() : undefined;
                if (!match || !command) return;

                // !luna remindme
                // - Remind me
                if (command === 'remindme' || command === 'lembrar') {
                    try {
                        const remindme = await processRemindMe(ctx, post, match[0]);
                        if (remindme) {
                            await ctx.cache.hSet(
                                'luna/remindme',
                                post._id,
                                JSON.stringify({
                                    cid: post.cid,
                                    ...remindme
                                })
                            );
                            ctx.log(`[luna/remindme] add:${repo}`);
                        }
                    } catch (e) {}
                }

                // !luna nuvem|wordcloud all|todos
                // if (command === 'nuvem' || command === 'wordcloud') {
                //     try {
                //         const reply = await processWordCloud(ctx, repo, post, match[0]);
                //         if (reply) {
                //             await ctx.cache.hSet('luna/wordcloud', post._id, reply.uri);
                //             ctx.log(`[luna/wordcloud] add:${repo}`);
                //         }
                //     } catch (e) {}
                // }

                // !luna primeiro|firstpost
                // - Quotes first post
                if (command === 'primeiro' || command === 'firstpost') {
                    if (await ctx.cache.exists(`luna/firstpost:${repo}`)) {
                        ctx.log(`[luna/firstpost] try:${repo}`);
                        return;
                    }
                    try {
                        const reply = await processFirstPost(ctx, repo, post);
                        if (reply) {
                            await ctx.cache.hSet('luna/firstpost', post._id, reply.uri);
                            await ctx.cache.set(`luna/firstpost:${repo}`, 1, { EX: 10 * MINUTE });
                            ctx.log(`[luna/firstpost] add:${repo}`);
                        }
                    } catch (e) {}
                }

                // !luna birthday
                // - Account creation timestamp
                if (command === 'birthday') {
                    if (await ctx.cache.exists(`luna/birthday:${repo}`)) {
                        ctx.log(`[luna/birthday] try:${repo}`);
                        return;
                    }
                    try {
                        const reply = await processBirthday(ctx, repo, post);
                        if (reply) {
                            await ctx.cache.hSet('luna/birthday', post._id, reply.uri);
                            await ctx.cache.set(`luna/birthday:${repo}`, 1, { EX: 10 * MINUTE });
                            ctx.log(`[luna/birthday] add:${repo}`);
                        }
                    } catch (e) {}
                }

                // !luna bolas|circles
                // - Default bolas
                if (command === 'bolas' || command === 'circles') {
                    if (await ctx.cache.exists(`luna/bolas:${repo}`)) {
                        ctx.log(`[luna/bolas] try:${repo}`);
                        return;
                    }
                    try {
                        const reply = await processBolas(ctx, repo, post);
                        if (reply) {
                            await ctx.cache.hSet('luna/bolas', post._id, reply.uri);
                            await ctx.cache.set(`luna/bolas:${repo}`, 1, { EX: 10 * MINUTE });
                            ctx.log(`[luna/bolas] add:${repo}`);
                        }
                    } catch (e) {
                        console.log(e)
                    }
                }
            }
        }
    }

    if (posts.delete.length > 0) {
        for (const del of posts.delete) {
            const remindmePost = await ctx.cache.hGet('luna/remindme', del.uri);
            if (remindmePost) {
                const remindmePostData: { [key: string]: string } = JSON.parse(remindmePost);
                if (remindmePostData.replyUri) {
                    await ctx.agent.deletePost(remindmePostData.replyUri);
                }
                await ctx.cache.hDel('luna/remindme', del.uri);
                ctx.log(`[luna/remindme] del:${repo}`);
            }

            const firstpostPost = await ctx.cache.hGet('luna/firstpost', del.uri);
            if (firstpostPost) {
                await ctx.agent.deletePost(firstpostPost);
                await ctx.cache.hDel('luna/firstpost', del.uri);
                ctx.log(`[luna/firstpost] del:${repo}`);
            }

            const birthdayPost = await ctx.cache.hGet('luna/birthday', del.uri);
            if (birthdayPost) {
                await ctx.agent.deletePost(birthdayPost);
                await ctx.cache.hDel('luna/birthday', del.uri);
                ctx.log(`[luna/birthday] del:${repo}`);
            }

            const bolasPost = await ctx.cache.hGet('luna/bolas', del.uri);
            if (bolasPost) {
                await ctx.agent.deletePost(bolasPost);
                await ctx.cache.hDel('luna/bolas', del.uri);
                ctx.log(`[luna/bolas] del:${repo}`);
            }

            const wordcloudPost = await ctx.cache.hGet('luna/wordcloud', del.uri);
            if (wordcloudPost) {
                await ctx.agent.deletePost(wordcloudPost);
                await ctx.cache.hDel('luna/wordcloud', del.uri);
                ctx.log(`[luna/wordcloud] del:${repo}`);
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

    const cfg: AppConfig = {
        devel: maybeBoolean(process.env.DEVEL) ?? true,
        bskyDid: maybeStr(process.env.LUNA_BSKY_DID) ?? '',
        bskyPwd: maybeStr(process.env.LUNA_BSKY_PASSWORD) ?? '',
        redisHost: maybeStr(process.env.REDIS_HOST) ?? 'localhost',
        redisPort: maybeInt(process.env.REDIS_PORT) ?? 6379
    };

    const log = (text: string) => {
        console.log(`[${new Date().toLocaleTimeString()}] [replier] ${text}`);
    };

    const agent = new BskyAgent({ service: 'https://bsky.social/' });
    await agent.login({ identifier: cfg.bskyDid, password: cfg.bskyPwd });

    const didres = new DidResolver({});

    const cache = await createClient({
        url: process.env.REDIS_URI
    })
        .on('error', (err) => log(`redis error: ${err}`))
        .on('connect', () => log('connected to redis'))
        .connect();

    const ctx: AppContext = {
        cfg,
        agent,
        didres,
        cache,
        log
    };

    cron.schedule('*/2 * * * *', async () => {
        await processRemindMeTask(ctx);
    });

    socket.on('data', async (data: FirehoseData): Promise<void> => {
        try {
            if (cfg.devel) {
                await processFirehoseStreamDevel(ctx, data);
            } else {
                await processFirehoseStream(ctx, data);
            }
        } catch (e) {
            log('Error');
            console.log(data);
            console.log(e);
        }
    });

    console.log(`[${new Date().toLocaleTimeString()}] [replier] started`);
};

run();
