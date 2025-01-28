<script lang="ts">
    import type { PageData } from './$types';
  
    export let data: PageData;
  </script>
  
  <h1>Search by actor</h1>
  
  <form>
    <input type="text" name="actor" placeholder="Enter actor" value={data.actor ?? ''} />
    <button type="submit">Search</button>
  </form>
  
  {#if data.data}
    <h2>Results for actor: {data.actor}</h2>
    <pre>{JSON.stringify(data.data, null, 2)}</pre>
  {:else if data.error}
    <p>Error: {data.error}</p>
  {:else if data.actor}
    <p>No results found for actor: {data.actor}</p>
  {/if}