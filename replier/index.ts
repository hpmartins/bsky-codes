var cron = require('node-cron');
import 'module-alias/register';
import 'dotenv/config';
import { Manager } from 'socket.io-client';
import { IPost, connectDb } from '../common/db';
import { FirehoseData } from '../common/types';
import { getCreationTimestamp, getFirstPost, getProfile, maybeBoolean, maybeInt, maybeStr } from '../common';
import { searchInteractions } from '../common/queries/interactions';
import { createCirclesImage } from '../common/circles';
import { AppBskyFeedPost, BskyAgent, RichText, UnicodeString } from '@atproto/api';
import redis, { createClient } from 'redis';
import dayjs from 'dayjs';
import { ids } from '../common/lexicon/lexicons';
import { PEOPLE_LIST_KEY, uid10 } from '../common/defaults';

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
    cache: redis.RedisClientType<any, any, any>;
    log: (text: string) => void;
};

async function processRemindMe(ctx: AppContext, post: IPost, precmd: string) {
    const text = post.text.replace(precmd, '');
    const match = text.match(/^([0-9]+\s*(?:mes|mês|meses|months|m(?:in(?:uto|ute)?s?)?|h(?:ours?|oras?|rs?)?|d(?:ays?|ias?)?|w(?:eeks?)?|s(?:emanas?)?|y(?:ears?)?|a(?:nos?)?)[\s,]*)+/gi);

    if (match) {
        const message = text.replace(match[0], '');
        const keys = match[0].matchAll(/([0-9]+)\s*(mes|mês|meses|months?|m(?:in(?:uto|ute)?s?)?|h(?:ours?|oras?|rs?)?|d(?:ays?|ias?)?|w(?:eeks?)?|s(?:emanas?)?|y(?:ears?)?|a(?:nos?)?)[\s,]*/gi)

        let targetDate = dayjs()
        for (const key of keys) {
            const timeAmount = Number(key[1])
            const timeType = String(key[2])
            if (timeType.match(/mes|mês|meses|months?/i)) {
                targetDate = targetDate.add(timeAmount, 'months');
            } else if (timeType.startsWith('m')) {
                targetDate = targetDate.add(timeAmount, 'minutes');
            } else if (timeType.startsWith('h')) {
                targetDate = targetDate.add(timeAmount, 'hours');
            } else if (timeType.startsWith('d')) {
                targetDate = targetDate.add(timeAmount, 'days');
            } else if (timeType.startsWith('w') || timeType.startsWith('s')) {
                targetDate = targetDate.add(timeAmount, 'weeks');
            } else if (timeType.startsWith('y') || timeType.startsWith('a')) {
                targetDate = targetDate.add(timeAmount, 'years')
            }
        }

        if (targetDate.isAfter()) {
            await ctx.agent.like(post._id, post.cid)
            return {
                date: targetDate,
                message: message,
            }
        }
    }
}

async function processRemindMeTask(ctx: AppContext) {
    const allKeys = await ctx.cache.hGetAll('luna/remindme');
    const allTasks = Object.entries(allKeys).map(x => ({
        uri: x[0],
        ...JSON.parse(x[1]) as {
            cid: string;
            date: string;
            message: string;
            replyUri?: string;
        }
    }));

    for (const task of allTasks) {
        if (dayjs(task.date).isBefore()) {
            const postRecord = {
                $type: 'app.bsky.feed.post',
                text: `🐈‍⬛ RemindMe: ${task.message}`,
                reply: {
                    parent: {
                        uri: task.uri,
                        cid: task.cid
                    },
                    root: {
                        uri: task.uri,
                        cid: task.cid
                    }
                },
                createdAt: new Date().toISOString()
            };
            const reply = await ctx.agent.post(postRecord);

            ctx.log(`[luna/remindme] post:${reply.uri}`);

            await ctx.cache.hSet('luna/remindme', task.uri, JSON.stringify({
                ...task, replyUri: reply.uri,
            }))
            return reply;
        }
    }
}

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

    await postText.detectFacets(ctx.agent);
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
    
    const reply = await ctx.agent.post(postRecord);

    return reply;
}

async function processFirstPost(ctx: AppContext, repo: string, post: IPost) {
    const locale = post.langs.length > 0 ? post.langs[0] : 'en';

    const record = await getFirstPost(repo);
    if (!record) return;

    let date: string;
    let text: string;
    if (locale.startsWith('pt')) {
        date = dayjs(record.value.createdAt).format('DD/MM/YYYY');
        text = `🐈‍⬛ Seu primeiro post foi em ${date}:`;
    } else {
        date = dayjs(record.value.createdAt).format('YYYY-MM-DD');
        text = `🐈‍⬛ You first posted on ${date}`;
    }
    const postText = new RichText({
        text: text
    });

    await postText.detectFacets(ctx.agent);
    const postRecord = {
        $type: ids.AppBskyFeedPost,
        text: postText.text,
        embed: {
            $type: ids.AppBskyEmbedRecord,
            record: {
                uri: record.uri,
                cid: record.cid,
            }
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
        facets: postText.facets,
        createdAt: new Date().toISOString()
    };
    
    const validate = AppBskyFeedPost.validateRecord(postRecord);
    if (validate.success) {
        const reply = await ctx.agent.post(postRecord);
        return reply;
    }
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

    const circles = await createCirclesImage(
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
    if (!circles) return;

    const listId = uid10();
    await ctx.cache.hSet(PEOPLE_LIST_KEY, listId, JSON.stringify(circles.people))

    let text: UnicodeString;
    const shorthandle = profile.handle.replace('.bsky.social', '');
    if (locale.startsWith('pt')) {
        text = new UnicodeString(`🐈‍⬛ Bolas de @${profile.handle} dos últimos 7 dias 🖤\nLista de arrobas | wolfgang/i/${shorthandle}`);
    } else {
        text = new UnicodeString(`🐈‍⬛ Circles of @${profile.handle} for the last 7 days 🖤\nList of handles | wolfgang/i/${shorthandle}`);
    }

    const postText = new RichText({
        text: text.utf16,
    });
    await postText.detectFacets(ctx.agent);

    const links = [
        {
            regex: /(Lista de arrobas|List of handles)/,
            href: `https://wolfgang.raios.xyz/arr/${listId}`,
        },
        {
            regex: /wolfgang.*$/,
            href: `https://wolfgang.raios.xyz/i/${shorthandle}`,
        }
    ]

    links.forEach(link => {
        const match = link.regex.exec(text.utf16);
        if (match) {
            const start = text.utf16.indexOf(match[0], match.index);
            const index = { start, end: start + match[0].length };
            postText.facets?.push({
                index: {
                    byteStart: text.utf16IndexToUtf8Index(index.start),
                    byteEnd: text.utf16IndexToUtf8Index(index.end)
                },
                features: [
                    {
                        $type: "app.bsky.richtext.facet#link",
                        uri: link.href,
                    }
                ]
            });
        }
    })

    return ctx.agent.uploadBlob(circles.image, { encoding: 'image/png' }).then((res) => {
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
                    return ctx.agent.post(postRecord);
                }
            }
        }
    });
}

export async function processFirehoseStreamDevel(ctx: AppContext, data: FirehoseData) {
    const { repo, posts } = data;
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
                            await ctx.cache.hSet('luna/remindme', post._id, JSON.stringify({
                                cid: post.cid,
                                ...remindme,
                            }))
                            ctx.log(`[luna/remindme] add:${repo}`)
                        }
                    }
                    catch (e) {}
                }

                // !luna primeiro|firstpost
                // - Quotes first post
                if (command === 'primeiro' || command === 'firstpost') {
                    if (await ctx.cache.exists(`luna/firstpost:${repo}`)) {
                        ctx.log(`[luna/firstpost] try:${repo}`);
                        return;
                    };
                    try {
                        const reply = await processFirstPost(ctx, repo, post);
                        if (reply) {
                            await ctx.cache.hSet('luna/firstpost', post._id, reply.uri)
                            await ctx.cache.set(`luna/firstpost:${repo}`, 1, { EX: 1*HOUR })
                            ctx.log(`[luna/firstpost] add:${repo}`)
                        }
                    } catch (e) {}
                }

                // !luna birthday
                // - Account creation timestamp
                if (command === 'birthday') {
                    if (await ctx.cache.exists(`luna/birthday:${repo}`)) {
                        ctx.log(`[luna/birthday] try:${repo}`);
                        return;
                    };
                    try {
                        const reply = await processBirthday(ctx, repo, post);
                        if (reply) {
                            await ctx.cache.hSet('luna/birthday', post._id, reply.uri)
                            await ctx.cache.set(`luna/birthday:${repo}`, 1, { EX: 1*HOUR })
                            ctx.log(`[luna/birthday] add:${repo}`)
                        }
                    } catch (e) {}
                }

                // !luna bolas|circles
                // - Default bolas
                if (command === 'bolas' || command === 'circles') {
                    if (await ctx.cache.exists(`luna/bolas:${repo}`)) {
                        ctx.log(`[luna/bolas] try:${repo}`);
                        return;
                    };
                    try {
                        const reply = await processBolas(ctx, repo, post);
                        if (reply) {
                            await ctx.cache.hSet('luna/bolas', post._id, reply.uri)
                            await ctx.cache.set(`luna/bolas:${repo}`, 1, { EX: 1*HOUR })
                            ctx.log(`[luna/bolas] add:${repo}`)
                        }
                    } catch (e) {}
                }
            }
        }
    }

    if (posts.delete.length > 0) {
        for (const del of posts.delete) {
            const remindmePost = await ctx.cache.hGet('luna/remindme', del.uri)
            if (remindmePost) {
                const remindmePostData: { [key: string]: string } = JSON.parse(remindmePost)
                await ctx.agent.deletePost(remindmePostData.replyUri)
                await ctx.cache.hDel('luna/remindme', del.uri)
                ctx.log(`[luna/remindme] del:${repo}`)
            }

            const firstpostPost = await ctx.cache.hGet('luna/firstpost', del.uri)
            if (firstpostPost) {
                await ctx.agent.deletePost(firstpostPost)
                await ctx.cache.hDel('luna/firstpost', del.uri)
                ctx.log(`[luna/firstpost] del:${repo}`)
            }

            const birthdayPost = await ctx.cache.hGet('luna/birthday', del.uri)
            if (birthdayPost) {
                await ctx.agent.deletePost(birthdayPost)
                await ctx.cache.hDel('luna/birthday', del.uri)
                ctx.log(`[luna/birthday] del:${repo}`)
            }

            const bolasPost = await ctx.cache.hGet('luna/bolas', del.uri)
            if (bolasPost) {
                await ctx.agent.deletePost(bolasPost)
                await ctx.cache.hDel('luna/bolas', del.uri)
                ctx.log(`[luna/bolas] del:${repo}`)
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

    const cache = await createClient({
        url: process.env.REDIS_URI,
    })
        .on('error', (err) => log(`redis error: ${err}`))
        .on('connect', () => log('connected to redis'))
        .connect();

    const ctx: AppContext = {
        cfg,
        agent,
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
