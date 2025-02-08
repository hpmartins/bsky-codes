<script lang="ts">
    import type { SimpleProfileType } from '$lib/types';
    export let did: string;
    export let profile: SimpleProfileType | null;
    export let blocked: boolean = false;

    const handle = profile?.handle ?? '';
    const displayName = profile?.display_name ?? profile?.handle ?? '';
</script>

<div class="flex items-center space-x-2">
    <div class="avatar">
            {#if profile?.avatar}
            <div class="rounded w-8 h-8">
                <img alt={''} loading="lazy" src={profile.avatar} />
            </div>
            {:else}
            <div class="text-center w-8 h-8">
                <i class="bi bi-person text-center" style="font-size: 1.5rem"></i>
            </div>
            {/if}
    </div>
    <div style="max-width: 120px">
        <div class="font-bold text-xs truncate {blocked ? 'line-through' : ''}">{displayName}&nbsp;</div>
        <div class="truncate"><a href="https://bsky.app/profile/{did}" class="text-xs opacity-50">@{handle}</a></div>
    </div>
</div>
