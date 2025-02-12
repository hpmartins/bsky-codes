export type SimpleProfileType = {
  did?: string;
  avatar: string | undefined;
  display_name: string | undefined;
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
  add_watermark: boolean;
  add_date: boolean;
  bg_color: string;
  add_border: boolean;
  border_color: string;
};

export type TopBlocksResponse = {
  _id: string;
  name: string;
  data: {
    key: string;
    items: {
      _id: string;
      count: number;
      profile: SimpleProfileType
    }[]
  }[]
}

export type TopInteractionsResponse = {
  _id: string;
  name: string;
  data: {
    key: string;
    subkey: string;
    items: {
      _id: string;
      count: number;
      c?: number;
      profile: SimpleProfileType
    }[]
  }[]
}