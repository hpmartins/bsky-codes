import type { PageServerLoad } from './$types';

const DATA_TYPE = 'top'

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

    const results: Record<string, any> = {}
    for (const name of NAMES) {
        console.log(name)
        try {
            const response = await fetch(`/api/dd?data_type=${DATA_TYPE}&name=${name}`)
            if (response.ok) {
                const data = await response.json()
                results[name] = data
            }
        } catch (error) {
            console.error('error fetching data')
            results[name] = {}
        }
    }

    return {
        results: results
    }
};
