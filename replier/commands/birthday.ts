import { AppContext, checkValidateAndPost } from '../index';
import { getCreationTimestamp } from '../../common';
import { RichText } from '@atproto/api';
import { IPost } from '../../common/db';
import dayjs from 'dayjs';

export async function processBirthday(ctx: AppContext, repo: string, post: IPost) {
    const locale = (post.langs && post.langs.length > 0) ? post.langs[0] : 'en';

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

    return await checkValidateAndPost(ctx.agent, postRecord);
}
