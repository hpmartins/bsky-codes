import type { InteractionsType, SimpleProfileType } from '@common/queries';
import type { Dayjs } from 'dayjs';

export type BlockType = {
  profile: SimpleProfileType;
  [key: string]: string | object;
};

export type InteractionsDataType = {
  found: boolean;
  date?: { type: string; start?: Dayjs; end?: Dayjs };
  sent?: InteractionsType[];
  rcvd?: InteractionsType[];
  both?: InteractionsType[];
};

export type CirclesOptionsType = {
  orbits: number;
  include_sent: boolean;
  include_rcvd: boolean;
  remove_bots: boolean;
  add_watermark: boolean;
  add_date: boolean;
  bg_color: string;
  add_border: boolean;
  border_color: string;
};
