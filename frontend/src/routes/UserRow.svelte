<script lang="ts">
  import type { SimpleProfileType } from "@common/types";
  export let did: string;
  export let profile: SimpleProfileType;

  const handle = profile.handle ?? '';
  const displayName = profile.displayName ?? profile.handle ?? '';
</script>

<div class="flex items-center space-x-3">
  <div class="avatar">
    <div class="mask mask-squircle w-9 h-9">
      {#if profile.avatar}
        <img alt={''} src={profile.avatar} />
      {:else}
        <i class="bi bi-person" style="font-size: 2rem" />
      {/if}
    </div>
  </div>
  <div>
    <div class="font-bold">{displayName}</div>
    <a href="https://bsky.app/profile/{did}" class="text-sm opacity-50">@{handle}</a>
  </div>
</div>
