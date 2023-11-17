export async function resolveHandle(handle: string) {
  try {
    const s = (handle.match(/\./g) || []).length;
    const attempt = s ? handle : `${handle}.bsky.social`
    const res = await fetch(`https://api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${attempt}`);
    const { did } = await res.json()
    if (did === undefined) {
      return;
    }
    return did;
  } catch (e) {
    return;
  }
}

export const flog = (text: string) => {
  console.log(`[${new Date().toLocaleTimeString()}] [frontend] ${text}`);
};

export async function getProfile(did: string) {
  const res = await fetch(`https://api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${did}`);
  return await res.json()
}


export const DO_NOT_INCLUDE_THESE = [
  'did:plc:xxno7p4xtpkxtn4ok6prtlcb', // @lovefairy.nl
  'did:plc:db645kt5coo7teuoxdjhq34x', // @blueskybaddies.bsky.social
  'did:plc:y4rd5hesgwwbkblvkkidfs73', // @wolfgang
  'did:plc:iw47x7htlvpkbbizqn2sgnks', // @whatsmid
]

export function getDateOfIsoWeek(week: number, year: number) {
    if (week < 1 || week > 53) {
      throw new RangeError("ISO 8601 weeks are numbered from 1 to 53");
    } else if (!Number.isInteger(week)) {
      throw new TypeError("Week must be an integer");
    } else if (!Number.isInteger(year)) {
      throw new TypeError("Year must be an integer");
    }
  
    const simple = new Date(year, 0, 1 + (week - 1) * 7);
    const dayOfWeek = simple.getDay();
    const isoWeekStart = simple;

    // Get the Monday past, and add a week if the day was
    // Friday, Saturday or Sunday.
  
    isoWeekStart.setDate(simple.getDate() - dayOfWeek + 1);
    if (dayOfWeek > 4) {
        isoWeekStart.setDate(isoWeekStart.getDate() + 7);
    }

    // The latest possible ISO week starts on December 28 of the current year.
    if (isoWeekStart.getFullYear() > year ||
        (isoWeekStart.getFullYear() == year &&
         isoWeekStart.getMonth() == 11 &&
         isoWeekStart.getDate() > 28)) {
        throw new RangeError(`${year} has no ISO week ${week}`);
    }
  
    return isoWeekStart;
}
