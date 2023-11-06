<script lang="ts">
  import type { ProfileType } from '$lib/types';
  export let did: string;
  export let profile: ProfileType;

  const handle = profile.handle ?? '';
  const displayName = profile.displayName ?? profile.handle ?? '';
</script>

<div class="text-left align-items-start" style="display: flex; align-items: center;">
  <div style="width: 44px;">
    {#if profile.avatar}
      <img alt={''} src={profile.avatar} width="32px" height="32px" style="border-radius: 20%;" />
    {:else}
      <i class="bi bi-person-square" style="font-size: 2rem" />
    {/if}
  </div>
  <div style="line-height: 1.1; word-wrap: break-word;">
    <div style="font-size: 0.85rem">
      {displayName}
    </div>
    <a href="https://bsky.app/profile/{did}" style="font-size: 0.70rem">
      @{handle}
    </a>
  </div>
</div>
