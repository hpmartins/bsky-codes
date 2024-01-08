import { AppContext, checkValidateAndPost } from "../index";
import { IPost } from "../../common/db";
import { getProfile } from "../../common";
import { UnicodeString, RichText } from "@atproto/api";
import { createCirclesImage } from "../../common/circles";
import { uid10, PEOPLE_LIST_KEY } from "../../common/defaults";
import { searchInteractions } from "../../common/queries/interactions";

export async function processBolas(ctx: AppContext, repo: string, post: IPost) {
    const locale = (post.langs && post.langs.length > 0) ? post.langs[0] : 'en';

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

            return checkValidateAndPost(ctx.agent, postRecord);
        }
    });
}
