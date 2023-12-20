import { AppContext } from '../index';
import { IPost } from '../../common/db';
import dayjs from 'dayjs';

export async function processRemindMe(ctx: AppContext, post: IPost, precmd: string) {
    const text = post.text.replace(precmd, '');
    const match = text.match(
        /^([0-9]+\s*(?:mes|mês|meses|months|m(?:in(?:uto|ute)?s?)?|h(?:ours?|oras?|rs?)?|d(?:ays?|ias?)?|w(?:eeks?)?|s(?:emanas?)?|y(?:ears?)?|a(?:nos?)?)[\s,]*)+/gi
    );

    if (match) {
        const message = text.replace(match[0], '');
        const keys = match[0].matchAll(
            /([0-9]+)\s*(mes|mês|meses|months?|m(?:in(?:uto|ute)?s?)?|h(?:ours?|oras?|rs?)?|d(?:ays?|ias?)?|w(?:eeks?)?|s(?:emanas?)?|y(?:ears?)?|a(?:nos?)?)[\s,]*/gi
        );

        let targetDate = dayjs();
        for (const key of keys) {
            const timeAmount = Number(key[1]);
            const timeType = String(key[2]);
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
                targetDate = targetDate.add(timeAmount, 'years');
            }
        }

        if (targetDate.isAfter()) {
            await ctx.agent.like(post._id, post.cid);
            return {
                date: targetDate,
                message: message
            };
        }
    }
}

export async function processRemindMeTask(ctx: AppContext) {
    const allKeys = await ctx.cache.hGetAll('luna/remindme');
    const allTasks = Object.entries(allKeys).map((x) => ({
        uri: x[0],
        ...(JSON.parse(x[1]) as {
            cid: string;
            date: string;
            message: string;
            replyUri?: string;
        })
    }));

    for (const task of allTasks) {
        if (task.replyUri !== undefined) continue;

        if (
            dayjs(task.date).isBefore() &&
            dayjs(task.date).isAfter(dayjs().subtract(10, 'minute'))
        ) {
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

            await ctx.cache.hSet(
                'luna/remindme',
                task.uri,
                JSON.stringify({
                    ...task,
                    replyUri: reply.uri
                })
            );
            return reply;
        }
    }
}
