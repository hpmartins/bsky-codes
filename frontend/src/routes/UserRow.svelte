<script lang="ts">
    import type { SimpleProfileType } from '$lib/types';
    export let did: string;
    export let profile: SimpleProfileType | null;
    export let blocked: boolean = false;

    const handle = profile?.handle ?? '';
    const displayName = profile?.display_name ?? profile?.handle ?? '';
</script>

<div class="flex items-center space-x-3">
    <div class="avatar">
        <div class="mask mask-squircle w-6 h-6">
            {#if profile?.avatar}
                <img alt={''} loading="lazy" src={profile.avatar} />
            {:else}
                <i class="bi bi-person" style="font-size: 1rem"></i>
            {/if}
        </div>
    </div>
    <div>
        <div class="font-bold text-xs {blocked ? 'line-through' : ''}">{displayName}</div>
        <a href="https://bsky.app/profile/{did}" class="text-xs opacity-50">@{handle}</a>
    </div>
</div>
