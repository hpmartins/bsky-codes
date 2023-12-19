import dayjs from 'dayjs';
import { Post } from '../../common/db';

import canvas from 'canvas';
import cloud, { Word } from 'd3-cloud';
import { EXCLUDE_WORDS } from '../const';
import sharp from 'sharp';
import D3Node from 'd3-node';
import chroma from 'chroma-js';
import { AppContext } from 'index';
import { AppBskyEmbedImages, AppBskyFeedPost } from '@atproto/api';

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

        const shortWordList = embed.images[0].alt.split('\n').slice(0, 3).join('\n');
        const shortEmojiList = embed.images[1].alt.split('\n').slice(0, 3).join('\n');
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

export const createLatestWordCloud = async (minutes: number) => {
    const words = await getLatestWordCloud(minutes);

    const normalizedWords = words
        .filter((x) => x._id.length > 1)
        .filter((x) => !/\p{Emoji}/u.test(x._id))
        .map((x) => ({
            text: x._id,
            size: x.count
        }));

    const colorScale = chroma
        .scale(['#006BB6', '#FDB927'])
        .domain([words[words.length - 1].count, words[0].count])
        .mode('lch');

    const d3n = new D3Node();

    cloud()
        .size([900, 900])
        .words(JSON.parse(JSON.stringify(normalizedWords)))
        .rotate(() => ~~(Math.random() * 2) * 45)
        .canvas(() => canvas.createCanvas(1, 1))
        .random(() => 0.5)
        .fontSize((d) => (d.size ? (100 * d.size) / words[0].count : 0))
        .fontStyle((d) => colorScale(d.size).hex())
        .padding(4)
        .on('end', draw)
        .start();

    async function draw(cloudWords: { [key: string]: any }[], bounds: { [key: string]: number }[]) {
        const { x: width, y: height } = bounds[1];

        const svg = d3n.createSVG(width, height);
        svg.append('rect').attr('width', '100%').attr('height', '100%').attr('fill', '#343434');

        svg.append('g')
            .attr('transform', 'translate(' + width / 2 + ',' + height / 2 + ')')
            .selectAll('text')
            .data(cloudWords)
            .enter()
            .append('text')
            .style('font-size', (d: Word) => d.size + 'px')
            .style('fill', (d: Word) => d.style)
            .style('font-family', 'Impact')
            .attr('text-anchor', 'middle')
            .attr('transform', (d: Word) => {
                return 'translate(' + [d.x, d.y] + ')rotate(' + d.rotate + ')';
            })
            .text((d: Word) => d.text);
    }

    return {
        alt: normalizedWords
            .slice(0, 40)
            .map((w, idx) => `${idx + 1}. ${w.text} (${w.size})`)
            .join('\n'),
        image: await sharp(Buffer.from(d3n.svgString())).png().toBuffer()
    };
};

export const createLatestEmojiCloud = async (minutes: number) => {
    const words = await getLatestEmojiCloud(minutes);

    const normalizedWords = words
        .filter((x) => !['⬛', '🟩', '🟨', '🟥', '🟪', '🟦', '⬜'].includes(x._id))
        .map((x) => ({
            text: x._id,
            size: x.count
        }));

    const cv = canvas.createCanvas(1, 1);

    cloud()
        .size([900, 900])
        .words(JSON.parse(JSON.stringify(normalizedWords)))
        .rotate(0)
        .canvas(() => canvas.createCanvas(1, 1))
        .random(() => Math.random())
        .font('Noto Color Emoji')
        .fontSize((d) => (d.size ? 100 * Math.pow(d.size / words[0].count, 0.25) : 0))
        .padding(15)
        .spiral('rectangular')
        .on('end', draw)
        .start();

    async function draw(cloudWords: { [key: string]: any }[], bounds: { [key: string]: number }[]) {
        const { x: width, y: height } = bounds[1];

        cv.width = width;
        cv.height = height;
        const ctx = cv.getContext('2d');

        ctx.fillStyle = '#343434';
        ctx.fillRect(0, 0, width, height);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.textDrawingMode = 'glyph';

        for (let word of cloudWords) {
            ctx.font = `${word.size}px ${word.font}`;
            ctx.fillText(word.text, width / 2 + word.x, height / 2 + word.y);
        }
    }

    return {
        alt: normalizedWords
            .slice(0, 40)
            .map((word, idx) => `${idx + 1}. ${word.text} (${word.size})`)
            .join('\n'),
        image: cv.toBuffer()
    };
};

export const getLatestEmojiCloud = async (
    minutes: number
): Promise<
    {
        _id: string;
        count: number;
    }[]
> => {
    const query = await Post.aggregate()
        .match({
            langs: 'pt',
            createdAt: {
                $gte: dayjs().subtract(minutes, 'minutes').toDate()
            },
            textLength: {
                $gt: 0
            },
            text: {
                $regex: /\p{Extended_Pictographic}/,
                $options: 'u'
            },
            deleted: false,
        })
        .project({
            _id: 0,
            emojis: {
                $regexFindAll: {
                    input: '$text',
                    regex: /\p{Extended_Pictographic}/u
                }
            }
        })
        .unwind('$emojis')
        .project({
            emojis: '$emojis.match'
        })
        .sortByCount('$emojis')
        .limit(40);

    return query;
};

export const getLatestWordCloud = async (
    minutes: number
): Promise<
    {
        _id: string;
        count: number;
    }[]
> => {
    const query = await Post.aggregate()
        .match({
            langs: 'pt',
            createdAt: {
                $gte: dayjs().subtract(minutes, 'minutes').toDate()
            },
            textLength: {
                $gt: 0
            },
            deleted: false,
        })
        .project({
            _id: 0,
            words: {
                $map: {
                    input: { $split: ['$text', ' '] },
                    as: 'str',
                    in: {
                        $trim: {
                            input: { $toLower: ['$$str'] },
                            chars: ' ,|(){}-<>.;\n'
                        }
                    }
                }
            }
        })
        .unwind('$words')
        .match({
            words: {
                $nin: EXCLUDE_WORDS
            }
        })
        .sortByCount('$words')
        .limit(100);

    return query.filter((x) => x._id.length > 1).filter((x) => !/\p{Emoji}/u.test(x._id));
};
