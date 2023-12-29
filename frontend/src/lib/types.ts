import type { InteractionsType, SimpleProfileType } from '@common/types';
import type { Dayjs } from 'dayjs';

export type BlockType = {
    profile: SimpleProfileType;
    [key: string]: string | object;
};

export type InteractionsDataType = {
    found: boolean;
    sent?: InteractionsType[];
    rcvd?: InteractionsType[];
    both?: InteractionsType[];
};

export type DateTypeWeekly = {
    type: 'weekly';
    start: Dayjs;
    end: Dayjs;
}

export type DateTypeStr = {
    type: 'all' | 'month' | 'week';
}

export type InteractionsDateType = DateTypeWeekly | DateTypeStr;

export type CirclesOptionsType = {
    orbits: number;
    include_sent: boolean;
    include_rcvd: boolean;
    remove_bots: boolean;
    remove_blocked: boolean;
    add_watermark: boolean;
    add_date: boolean;
    bg_color: string;
    add_border: boolean;
    border_color: string;
};
