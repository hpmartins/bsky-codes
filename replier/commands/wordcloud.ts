import { AppContext, checkValidateAndPost } from '../index';
import { createUserWordCloud } from '../../common/wordcloud';
import { IPost, SyncProfile } from '../../common/db';
import { syncRecords } from '../../common';
import { RichText } from '@atproto/api';

export async function processWordCloud(ctx: AppContext, repo: string, post: IPost) {
    const locale = post.langs.length > 0 ? post.langs[0] : 'en';

    const syncProfile = await SyncProfile.findById(repo);
    if (!syncProfile || !syncProfile.updated) {
        const doc = await ctx.didres.resolveAtprotoData(repo);
        if (!doc) return;
        await syncRecords(doc, 'app.bsky.feed.post');
    }

    const wordCloud = await createUserWordCloud(repo);

    let text: string;
    if (locale.startsWith('pt')) {
        text = `🐈‍⬛ Nuvem de palavras de todos seus posts:`
    } else {
        text = `🐈‍⬛ Word cloud of all your posts:`
    }
    const postText = new RichText({
        text: text
    })
    await postText.detectFacets(ctx.agent);

    return ctx.agent.uploadBlob(wordCloud.image, { encoding: 'image/png' }).then((res) => {
        if (res.success) {
            const postRecord = {
                $type: 'app.bsky.feed.post',
                text: postText.text,
                facets: postText.facets,
                embed: {
                    $type: 'app.bsky.embed.images',
                    images: [{ image: res.data.blob, alt: wordCloud.alt }]
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
                createdAt: new Date().toISOString(),
            };
            return checkValidateAndPost(ctx.agent, postRecord);
        }
    });
}
