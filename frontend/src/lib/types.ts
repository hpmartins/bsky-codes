import type { Dayjs } from "dayjs"

export type ProfileType = {
    [key: string]: string
}

export type BlockType = {
    profile: ProfileType,
    [key: string]: string | object
}

export type InteractionsType = {
    profile: ProfileType
    _id: string
    total: number
    points: number
    [key: string]: string | number | object  
}

export type InteractionsDataType = {
    found: boolean;
    date?: { type: string; start?: Dayjs; end?: Dayjs };
    sent?: InteractionsType[];
    rcvd?: InteractionsType[];
}

export type CirclesOptionsType = {
    orbits: number
    include_sent: boolean
    include_rcvd: boolean
    remove_bots: boolean
    add_watermark: boolean
    add_date: boolean
    bg_color: string
}
