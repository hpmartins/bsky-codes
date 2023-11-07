import { Interaction, Profile } from "./db/schema";
import { ProfileViewDetailed } from "../lexicon/types/app/bsky/actor/defs";
import { OutputSchema as ListReposSchema } from "../lexicon/types/com/atproto/sync/listRepos";
import { OutputSchema as ListRecordsSchema } from "../lexicon/types/com/atproto/repo/listRecords";

export * from "./db/index";
export * from "./db/schema";

export const getDateTime = (date?: number | Date) => {
  if (!date) return new Date().toISOString().slice(0, 19).replace("T", " ");
  return new Date(date).toISOString().slice(0, 19).replace("T", " ");
};

export const maybeBoolean = (val?: string) => {
  if (!val) return undefined;
  const int = parseInt(val, 10);
  if (isNaN(int)) return undefined;
  return !!int;
};

export const maybeStr = (val?: string) => {
  if (!val) return undefined;
  return val;
};

export const maybeInt = (val?: string) => {
  if (!val) return undefined;
  const int = parseInt(val, 10);
  if (isNaN(int)) return undefined;
  return int;
};

export async function listRepos(params: {
  limit: number;
  cursor?: string | undefined;
}): Promise<ListReposSchema | undefined> {
  const p = new URLSearchParams({
    limit: params.limit.toString(),
    cursor: params.cursor ?? "",
  });

  return fetch(
    `https://bsky.network/xrpc/com.atproto.sync.listRepos?${p}`
  ).then((res) => {
    if (!res.ok) {
      return;
    }
    return res.json() as Promise<ListReposSchema>;
  });
}

export async function listRecords(
  pds: string,
  params: {
    repo: string;
    collection: string;
    limit: number;
    cursor: string | undefined;
    reverse: boolean;
  }
): Promise<ListRecordsSchema | undefined> {
  const p = {
    repo: params.repo,
    collection: params.collection,
    limit: params.limit.toString(),
    cursor: params.cursor ?? "",
    reverse: params.reverse.toString(),
  };
  return fetch(
    `${pds}/xrpc/com.atproto.repo.listRecords?${new URLSearchParams(p)}`
  ).then((res) => {
    if (!res.ok) {
      return;
    }
    return res.json() as Promise<ListRecordsSchema>;
  });
}

export async function getProfile(
  did: string
): Promise<ProfileViewDetailed | undefined> {
  return fetch(
    `https://api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${did}`
  ).then((res) => {
    if (!res.ok) {
      return;
    }
    return res.json() as Promise<ProfileViewDetailed>;
  });
}

export async function updateProfile(
  did: string
): Promise<ProfileViewDetailed | undefined> {
  try {
    const profile = await getProfile(did);
    console.log(profile);
    if (!!profile) {
      const query = await Profile.findOne({ _id: did }, "indexedAt");
      if (!!query && !!query.indexedAt) {
        await Profile.updateOne(
          { _id: did },
          {
            handle: profile.handle,
            displayName: profile.displayName,
            avatar: profile.avatar ?? null,
            description: profile.description ?? null,
            lastProfileUpdateAt: getDateTime(),
          },
          { upsert: true }
        );
      } else {
        await Profile.updateOne(
          { _id: did },
          {
            handle: profile.handle,
            displayName: profile.displayName,
            avatar: profile.avatar ?? null,
            description: profile.description ?? null,
            indexedAt: profile.indexedAt
              ? getDateTime(new Date(profile.indexedAt))
              : null,
            lastProfileUpdateAt: getDateTime(),
          },
          { upsert: true }
        );
      }
      return profile;
    } else {
      return;
    }
  } catch (e: any) {
    if (e.error === "AccountTakedown") {
      await Profile.updateOne(
        { _id: did },
        {
          displayName: "Account has been taken down",
          lastProfileUpdateAt: getDateTime(),
        }
      );
    }
  }
  return;
}

export const updatePartition = async (
  author: string,
  subject: string,
  date: string,
  inc: any,
  push: any
) => {
  try {
    const authorSubjectCheck = await Interaction.exists({
      _id: { author: author, subject: subject },
    });
    if (authorSubjectCheck) {
      const dateCheck = await Interaction.exists({
        _id: { author: author, subject: subject },
        "list._id": date,
      });
      if (dateCheck) {
        await Interaction.updateOne(
          {
            _id: { author: author, subject: subject },
            "list._id": date,
          },
          { $inc: inc }
        );
      } else {
        await Interaction.updateOne(
          {
            _id: { author: author, subject: subject },
          },
          {
            $push: {
              list: push,
            },
          }
        );
      }
    } else {
      await Interaction.updateOne(
        {
          _id: { author: author, subject: subject },
        },
        {
          $push: {
            list: push,
          },
        },
        { upsert: true }
      );
    }
  } catch (e) {
    console.log("###########################################");
    console.log(author);
    console.log(subject);
    console.log(inc);
    console.log(push);
    console.log("###########################################");
  }
};
