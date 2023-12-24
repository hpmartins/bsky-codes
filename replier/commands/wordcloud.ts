import { AppContext, checkValidateAndPost } from '../index';
import { createUserEmojiCloud, createUserWordCloud } from '../../common/wordcloud';
import { IPost, SyncProfile } from '../../common/db';
import { syncRecords } from '../../common';
import { AppBskyEmbedImages, RichText } from '@atproto/api';

export async function processWordCloud(ctx: AppContext, repo: string, post: IPost, precmd: string) {
    const args = post.text.replace(precmd, '').trim();
    const match = args.match(/^(all|todos)/gi);

    const locale = post.langs.length > 0 ? post.langs[0] : 'en';

    const syncProfile = await SyncProfile.findById(repo);
    if (!syncProfile || !syncProfile.updated) {
        const doc = await ctx.didres.resolveAtprotoData(repo);
        if (!doc) return;
        await syncRecords(doc, 'app.bsky.feed.post');
    }

    let clouds: { alt: string; image: Buffer }[] = [];
    let text: string | undefined;

    if (match) {
        clouds = [await createUserWordCloud(repo), await createUserEmojiCloud(repo)];
        if (locale.startsWith('pt')) {
            text = `🐈‍⬛ Nuvem de palavras de todos seus posts:`;
        } else {
            text = `🐈‍⬛ Word cloud of all your posts:`;
        }
    } else if (args.length == 0) {
        clouds = [await createUserWordCloud(repo, 7), await createUserEmojiCloud(repo, 7)];
        if (locale.startsWith('pt')) {
            text = `🐈‍⬛ Nuvem de palavras dos seus posts (últimos 7 dias):`;
        } else {
            text = `🐈‍⬛ Word cloud of your posts (last 7 days):`;
        }
    }

    if (!text || clouds.length == 0) return;

    const uploadedImages = await Promise.all(
        clouds.map(async (cld) => {
            const uploaded = await ctx.agent.uploadBlob(cld.image, { encoding: 'image/png' });
            if (!uploaded.success) throw new Error('Failed to upload image');

            return {
                image: uploaded.data.blob,
                alt: cld.alt
            } satisfies AppBskyEmbedImages.Image;
        })
    );

    const embed =
        uploadedImages.length > 0
            ? {
                  $type: 'app.bsky.embed.images',
                  images: uploadedImages
              }
            : undefined;

    if (embed) {
        const postText = new RichText({
            text: text
        });
        await postText.detectFacets(ctx.agent);

        const postRecord = {
            $type: 'app.bsky.feed.post',
            text: postText.text,
            createdAt: new Date().toISOString(),
            embed: embed,
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

        return checkValidateAndPost(ctx.agent, postRecord);
    }
}
