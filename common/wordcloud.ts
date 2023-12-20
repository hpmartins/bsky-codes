import dayjs from 'dayjs';
import { Post } from './db';

import canvas from 'canvas';
import cloud, { Word } from 'd3-cloud';
import sharp from 'sharp';

// @ts-ignore
import D3Node from 'd3-node';
import chroma from 'chroma-js';
import { AppBskyEmbedImages, AppBskyFeedPost, BskyAgent } from '@atproto/api';

import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

// @ts-ignore
import { getWordsList } from 'most-common-words-by-language';

dayjs.extend(utc);
dayjs.extend(timezone);

const TIMEZONE = 'America/Sao_Paulo';

const EN_EXCLUDED_WORDS = getWordsList('english', 300);
const PT_EXCLUDED_WORDS = getWordsList('portuguese', 300);
const DE_EXCLUDED_WORDS = getWordsList('german', 300);

const EXCLUDE_WORDS = [
    ...EN_EXCLUDED_WORDS,
    ...PT_EXCLUDED_WORDS,
    ...DE_EXCLUDED_WORDS,
    '',
    'vc',
    'vcs',
    'ta',
    'tá',
    'uns',
    'ja',
    'very',
    'every',
    'she',
    'he',
    'nao',
    'É',
    'tô',
    'pq',
    'à',
    'às',
    'hoje',
    'pela',
];

export const postClouds = async (agent: BskyAgent, minutes: number) => {
    const clouds = [await createLatestWordCloud(minutes), await createLatestEmojiCloud(minutes)];

    const uploadedImages = await Promise.all(
        clouds.map(async (cld) => {
            const uploaded = await agent.uploadBlob(cld.image, { encoding: 'image/png' });
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
            await agent.post(postRecord);
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
            .join(', '),
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
            .join(', '),
        image: cv.toBuffer()
    };
};

export const createUserWordCloud = async (repo: string, days?: number) => {
    const words = await getUserWordCloud(repo, days);

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
            .join(', '),
        image: await sharp(Buffer.from(d3n.svgString())).png().toBuffer()
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
            deleted: false
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
            deleted: false
        })
        .project({
            _id: 0,
            words: {
                $map: {
                    input: { $split: [{ $replaceAll: {
                        input: '$text',
                        find: '\n',
                        replacement: ' ',
                    } }, ' '] },
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
        .match({
            words: {
                $not: {
                    $regex: /['‘’]/,
                }
            }
        })
        .sortByCount('$words')
        .limit(500);

    return query.filter((x) => x._id.length > 1).filter((x) => !/\p{Emoji}/u.test(x._id));
};

export const getUserWordCloud = async (
    repo: string,
    days?: number
): Promise<
    {
        _id: string;
        count: number;
    }[]
> => {
    let qb = Post.aggregate().match({
        author: repo,
        textLength: { $gt: 0 },
        deleted: false
    });

    if (days) {
        qb = qb.match({
            createdAt: {
                $gte: dayjs().subtract(days, 'days').toDate()
            }
        });
    }

    qb = qb
        .project({
            _id: 0,
            words: {
                $map: {
                    input: { $split: [{ $replaceAll: {
                        input: '$text',
                        find: '\n',
                        replacement: ' ',
                    } }, ' '] },
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
        .match({
            words: {
                $not: {
                    $regex: /['‘’]/,
                }
            }
        })
        .sortByCount('$words')
        .limit(500);

    const query = await qb.exec();

    return query.filter((x) => x._id.length > 1).filter((x) => !/\p{Emoji}/u.test(x._id));
};

// const EXCLUDE_WORDS = [
//     '',
//     'o',
//     'é',
//     'e',
//     'a',
//     'em',
//     'de',
//     'que',
//     'eu',
//     'não',
//     'do',
//     'um',
//     'no',
//     'com',
//     'pra',
//     'uma',
//     'mas',
//     'da',
//     'me',
//     'na',
//     'se',
//     'mais',
//     'só',
//     'tem',
//     'por',
//     'the',
//     'muito',
//     'meu',
//     'já',
//     'my',
//     'you',
//     "i'm",
//     "it's",
//     'be',
//     'are',
//     'this',
//     'on',
//     'but',
//     'so',
//     'has',
//     'as',
//     'minha',
//     'para',
//     'aqui',
//     'os',
//     'vou',
//     'isso',
//     'ele',
//     'foi',
//     'como',
//     'to',
//     'esse',
//     'bem',
//     'q',
//     'i',
//     'É',
//     'it',
//     'nao',
//     'that',
//     'uns',
//     'in',
//     'of',
//     'is',
//     'aí',
//     'lá',
//     'tá',
//     'vai',
//     'ser',
//     'tô',
//     'ter',
//     'vc',
//     'tudo',
//     'and',
//     'ainda',
//     'hoje',
//     'pq',
//     'sim',
//     'coisa',
//     'dos',
//     'ao',
//     'das',
//     'à',
//     'seu',
//     'sua',
//     'ou',
//     'quando',
//     'nos',
//     'também',
//     'pelo',
//     'pela',
//     'até',
//     'ela',
//     'entre',
//     'depois',
//     'sem',
//     'mesmo',
//     'aos',
//     'seus',
//     'quem',
//     'nas',
//     'eles',
//     'você',
//     'essa',
//     'num',
//     'nem',
//     'suas',
//     'às',
//     'numa',
//     'pelos',
//     'elas',
//     'qual',
//     'nós',
//     'lhe',
//     'deles',
//     'essas',
//     'esses',
//     'pelas',
//     'este',
//     'dele',
//     'tu',
//     'te',
//     'vocês',
//     'vos',
//     'lhes',
//     'meus',
//     'minhas',
//     'teu',
//     'tua',
//     'teus',
//     'tuas',
//     'nosso',
//     'nossa',
//     'nossos',
//     'nossas',
//     'dela',
//     'delas',
//     'esta',
//     'estes',
//     'estas',
//     'aquele',
//     'aquela',
//     'aqueles',
//     'aquelas',
//     'isto',
//     'aquilo',
//     'estou',
//     'está',
//     'estamos',
//     'estão',
//     'estive',
//     'esteve',
//     'estivemos',
//     'estiveram',
//     'estava',
//     'estávamos',
//     'estavam',
//     'estivera',
//     'estivéramos',
//     'esteja',
//     'estejamos',
//     'estejam',
//     'estivesse',
//     'estivéssemos',
//     'estivessem',
//     'estiver',
//     'estivermos',
//     'estiverem',
//     'hei',
//     'há',
//     'havemos',
//     'hão',
//     'houve',
//     'houvemos',
//     'houveram',
//     'houvera',
//     'houvéramos',
//     'haja',
//     'hajamos',
//     'hajam',
//     'houvesse',
//     'houvéssemos',
//     'houvessem',
//     'houver',
//     'houvermos',
//     'houverem',
//     'houverei',
//     'houverá',
//     'houveremos',
//     'houverão',
//     'houveria',
//     'houveríamos',
//     'houveriam',
//     'sou',
//     'somos',
//     'são',
//     'era',
//     'éramos',
//     'eram',
//     'fui',
//     'fomos',
//     'foram',
//     'fora',
//     'fôramos',
//     'seja',
//     'sejamos',
//     'sejam',
//     'fosse',
//     'fôssemos',
//     'fossem',
//     'for',
//     'formos',
//     'forem',
//     'serei',
//     'será',
//     'seremos',
//     'serão',
//     'seria',
//     'seríamos',
//     'seriam',
//     'tenho',
//     'temos',
//     'tém',
//     'tinha',
//     'tínhamos',
//     'tinham',
//     'tive',
//     'teve',
//     'tivemos',
//     'tiveram',
//     'tivera',
//     'tivéramos',
//     'tenha',
//     'tenhamos',
//     'tenham',
//     'tivesse',
//     'tivéssemos',
//     'tivessem',
//     'tiver',
//     'tivermos',
//     'tiverem',
//     'terei',
//     'terá',
//     'teremos',
//     'terão',
//     'teria',
//     'teríamos',
//     'teriam',
//     'dá',
//     'bom',
//     'dia',
//     'fazer',
//     'gente',
//     'ver',
//     'tão',
//     'assim',
//     'tava',
//     'acho',
//     'então',
//     'pode',
//     'agora',
//     'todo',
//     'pois',
//     'todos',
//     'todas',
//     'entao',
//     'nada',
//     'fica',
//     'noite',
//     'tarde',
//     'vez',
//     'vcs',
//     'vem',
//     'porque',
//     'ta',
//     'tb',
//     'tbm',
//     'mim',
//     'hj',
//     'sei',
//     'né',
//     'faz',
//     'vê',
// ];
