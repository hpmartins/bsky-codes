import type { RequestHandler } from './$types';
import { Profile } from '$lib/server/db';
import { getProfile } from '$lib/utils';

export const POST: RequestHandler = async ({ request }) => {
  const input = await request.json();
  const profile = await getProfile(input.did);
  if (!profile) return new Response(undefined)
  const newprofile = await Profile.findOneAndUpdate(
    { _id: profile.did },
    {
      handle: profile.handle,
      displayName: profile.displayName,
      avatar: profile.avatar,
      description: profile.description,
      lastProfileUpdateAt: new Date()
    },
    { new: true }
  );
  return new Response(JSON.stringify(newprofile));
};
