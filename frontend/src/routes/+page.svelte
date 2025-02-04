<script lang="ts">
    let { data }: { data: { results: any } } = $props();

    import Table from "#/Table.svelte";

    const RECORDS = [
        "app.bsky.feed.like",
        "app.bsky.feed.repost",
        "app.bsky.feed.post",
    ];

    const NAMES = ["author", "subject"];
</script>

{#if data.results}
    {#each NAMES as name}
    <p>{name}</p>
    {#each RECORDS as record_type}
        <p>{record_type}</p>
            {JSON.stringify(data.results[record_type][name])}
        {/each}
    {/each}
{/if}
