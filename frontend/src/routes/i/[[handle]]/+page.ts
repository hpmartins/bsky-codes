import type { PageLoad } from './$types';
import type { InteractionsDataType, InteractionsInternalDataType } from '$lib/types';

export const load: PageLoad = async ({ fetch, url, params }) => {

  if (!params.handle) {
    return {}
  }

  let did: string | undefined;
  const handle = params.handle.replace(/^@/, '');
  if (handle.length > 0) {
    const url = new URL("https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle");
    url.searchParams.append("handle", handle);
    const resolve_response = await fetch(url.toString());
    const resolve_response_data = await resolve_response.json();
    if (resolve_response.ok) {
      did = resolve_response_data.did
    } else {
      return {
        success: false,
        error: resolve_response_data.message 
      }
    }
  }

  if (did) {
    try {
      const response = await fetch("/api/interactions", {
        method: "POST",
        body: JSON.stringify({did, handle})
      })
      const response_data: InteractionsInternalDataType = await response.json()
      return response_data
    } catch (error) {
      return {
        success: false,
        error: "error fetching interactions",
      }
    }
  } else {
    return {
      success: false,
      error: "user not found",
    }
  }
};