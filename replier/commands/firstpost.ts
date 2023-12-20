import { AppContext, checkValidateAndPost } from '../index';
import { getFirstPost } from '../../common';
import { RichText } from '@atproto/api';
import { IPost } from '../../common/db';
import dayjs from 'dayjs';
import { ids } from '../../common/lexicon/lexicons';

export async function processFirstPost(ctx: AppContext, repo: string, post: IPost) {
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
                cid: record.cid
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

    return await checkValidateAndPost(ctx.agent, postRecord);
}
