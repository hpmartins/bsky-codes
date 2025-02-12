<script lang="ts">
    import type { TopBlocksResponse, TopInteractionsResponse } from "$lib/types";
    let { data }: { data: { top_interactions: TopInteractionsResponse; top_blocks: TopBlocksResponse } } = $props();

    import { t } from "$lib/translations";
    import TopInteractions from "#/TopInteractions.svelte";
    import TopBlocks from "#/TopBlocks.svelte";
</script>

<div class="border rounded-md">
    <p class="text-md text-primary text-center">{$t("stuff.top.updateDesc")}</p>
    <hr />
    {#if data.top_interactions}
        <TopInteractions src={data.top_interactions} />
    {/if}

    {#if data.top_blocks}
        <TopBlocks src={data.top_blocks} />
    {/if}
</div>
