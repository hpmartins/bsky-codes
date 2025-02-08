import type { PageServerLoad } from './$types';

const DATA_TYPE = 'top'

const RECORDS = [
    "like",
    "repost",
    "post",
]

const NAMES = [
    "author",
    "subject",
]

export const load: PageServerLoad = async ({ fetch }) => {

    const top_interactions: Record<string, Record<string, any>> = {}
    for (const name of NAMES) {
        top_interactions[name] = {}
        for (const record_type of RECORDS) {
            try {
                const response = await fetch(`/api/dd?data_type=${DATA_TYPE}&record_type=${record_type}&name=${name}`)
                if (response.ok) {
                    const data = await response.json()
                    top_interactions[name][record_type] = data
                }
            } catch (error) {
                console.error('error fetching data')
                top_interactions[name][record_type] = {}
            }
        }

    }

    const top_blocks: Record<string, any> = {}
    for (const name of NAMES) {
        try {
            const response = await fetch(`/api/dd?data_type=${DATA_TYPE}&record_type=block&name=${name}`)
            if (response.ok) {
                const data = await response.json()
                top_blocks[name] = data
            }
        } catch (error) {
            console.error('error fetching data')
            top_blocks[name] = {}
        }
    }

    return {
        top_interactions: top_interactions,
        top_blocks: top_blocks
    }
};
