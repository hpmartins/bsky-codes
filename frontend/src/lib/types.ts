export type SimpleProfileType = {
  did: string;
  avatar: string | undefined;
  displayName: string | undefined;
  handle: string;
};

export type InteractionsType = {
  _id: string;
  idx?: number;
  blocked: boolean;
  characters: number;
  replies: number;
  likes: number;
  reposts: number;
  total: number;
  points: number;
  profile: SimpleProfileType;
};

export type InteractionsDataType = {
  found: boolean;
  sent?: InteractionsType[];
  rcvd?: InteractionsType[];
  both?: InteractionsType[];
};

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
