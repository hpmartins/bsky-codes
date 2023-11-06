<script lang="ts">
    import type { PageServerData } from "./$types";
    import TopBlocksTable from "./TopBlocksTable.svelte";
    import TopPostersTable from "./TopPostersTable.svelte";

    export let data: PageServerData
</script>

<div class="row justify-content-center my-3">
    <div class="col-sm-12 col-md-6 my-3">
        {#if data.type === 'blocks'}
        <TopBlocksTable data={data.list} perPage={20} />
        {:else if data.type === 'posters'}
        <TopPostersTable data={data.list} perPage={20} />
        {/if}
    </div>
</div>
