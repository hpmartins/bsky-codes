<script lang="ts">
  import type { PageServerData } from './$types';
  import TopBlockedTable from './TopBlockedTable.svelte';
  import TopPostersTable from './TopPostersTable.svelte';

  export let data: PageServerData;
</script>

<div class="col-sm-12 col-md-6 my-3">
  {#if data.type === 'blocked'}
    <TopBlockedTable {data} perPage={25} />
  {:else if data.type === 'posters'}
    <TopPostersTable {data} perPage={25} />
  {/if}
</div>
