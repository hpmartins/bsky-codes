import type { PageServerLoad } from './$types';

const RECORDS = [
    "app.bsky.feed.like",
    "app.bsky.feed.repost",
    "app.bsky.feed.post",
]

const NAMES = [
    "author",
    "subject",
]

export const load: PageServerLoad = async ({ fetch }) => {

    const results: Record<string, Record<string, any>> = {}
    for (const record_type of RECORDS) {
        results[record_type] = {}
        for (const name of NAMES) {
            console.log(record_type, name)
            try {
                const response = await fetch(`/api/fetch?record_type=${record_type}&name=${name}`)
                if (response.ok) {
                    const data = await response.json()
                    results[record_type][name] = data
                }
            } catch (error) {
                console.error('error fetching data')
                results[record_type][name] = {}
            }
        }
    }

    return {
        data: results
    }
};
