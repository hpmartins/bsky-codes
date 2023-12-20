import dayjs from 'dayjs';
import { AppContext } from '../index';
import { AppBskyEmbedImages, AppBskyFeedPost } from '@atproto/api';
import { createLatestWordCloud, createLatestEmojiCloud } from '../../common/wordcloud'

import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

const TIMEZONE = 'America/Sao_Paulo';

export const postClouds = async (ctx: AppContext, minutes: number) => {
    const clouds = [await createLatestWordCloud(minutes), await createLatestEmojiCloud(minutes)];

    const uploadedImages = await Promise.all(
        clouds.map(async (cld) => {
            const uploaded = await ctx.agent2.uploadBlob(cld.image, { encoding: 'image/png' });
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
        const timeFrom = dayjs().subtract(minutes, 'minutes').tz(TIMEZONE).format('HH:mm');
        const timeTo = dayjs().tz(TIMEZONE).format('HH:mm');

        const shortWordList = embed.images[0].alt.split(', ').slice(0, 3).join(', ');
        const shortEmojiList = embed.images[1].alt.split(', ').slice(0, 3).join(', ');
        const postRecord = {
            $type: 'app.bsky.feed.post',
            text: `Nuvem de palavras e emojis de posts em português (${timeFrom} até ${timeTo})\n\n${shortWordList}\n\n${shortEmojiList}`,
            createdAt: new Date().toISOString(),
            embed: embed
        };

        if (
            AppBskyFeedPost.isRecord(postRecord) &&
            AppBskyFeedPost.validateRecord(postRecord).success
        ) {
            await ctx.agent2.post(postRecord);
        }
    }
};
