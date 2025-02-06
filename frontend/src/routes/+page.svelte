<script lang="ts">
    let { data }: { data: { results: any } } = $props();

    import Pagination from "#/Pagination.svelte";
    import UserRow from "#/UserRow.svelte";

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
    <div class="flex flex-row py-3">
        {#each RECORDS as record}
            {@const items = data.results[name].data[record].slice(0, 50)}
            <div class="flex flex-col px-3">
                <p>{record}</p>
            <!-- <Pagination rows={items ?? []} perPage={5} bind:trimmedRows={paginatedData} /> -->
            <div class="overflow-x-auto w-full md:max-w-2xl">
                <table class="table table-xs table-zebra">
                    <thead>
                        <tr class="text-center text-lg text-primary">
                            <th>#</th>
                            <th>user</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each items as row, idx (row._id)}
                            <tr class="text-center">
                                <td>{idx+1}</td>
                                <td class="text-left">
                                    <UserRow did={row._id} profile={row.profile} />
                                </td>
                                <td>{row.n}</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
        {/each}
    </div>
    {/each}
{/if}
