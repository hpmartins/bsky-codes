<script lang="ts">
    let { data }: { data: { top_interactions: any; top_blocks: any } } = $props();

    import { t } from "$lib/translations";
    import TopInteractions from "#/TopInteractions.svelte";
    import TopBlocks from "#/TopBlocks.svelte";
</script>

<div class="my-2 border rounded-md">
    <p class="text-md text-primary">{$t("stuff.top.updateDesc")}</p>
    <hr />
    {#if data.top_interactions}
        <TopInteractions data={data.top_interactions} />
    {/if}

    {#if data.top_blocks}
        <p class="pt-5 text-xl text-primary">blocks</p>
        <div class="flex flex-row justify-center py-3">
            <TopBlocks data={data.top_blocks} />
        </div>
    {/if}
</div>
