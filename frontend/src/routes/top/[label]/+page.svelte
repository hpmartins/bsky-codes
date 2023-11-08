<script lang="ts">
    import type { PageServerData } from "./$types";
    import TopBlockedTable from "./TopBlockedTable.svelte";
    import TopPostersTable from "./TopPostersTable.svelte";

    export let data: PageServerData
</script>

<div class="row justify-content-center my-3">
    <div class="col-sm-12 col-md-6 my-3">
        {#if data.type === 'blocked'}
        <TopBlockedTable data={data} perPage={10} />
        {:else if data.type === 'posters'}
        <TopPostersTable data={data} perPage={10} />
        {/if}
    </div>
</div>
