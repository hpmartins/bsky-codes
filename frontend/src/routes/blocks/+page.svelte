<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import BlocksTable from '../BlocksTable.svelte';
  
  export let data: PageData;
  export let form: ActionData;
</script>

<svelte:head>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <script src="https://unpkg.com/cal-heatmap/dist/cal-heatmap.min.js"></script>
  <link rel="stylesheet" href="https://unpkg.com/cal-heatmap/dist/cal-heatmap.css" />
  <title>Wolfgang - Blocks</title>
</svelte:head>

<h3 class="text-center">List of blocks</h3>

<h5 class="text-center">{data.count} blocks indexed</h5>

<div class="row align-items-center justify-content-center my-3">
  <div class="col-sm-12 col-md-5">
    <form id="form" method="post">
      <div class="input-group input-group-xl">
        <span class="input-group-text">@</span>
        <input
          class="form-control"
          id="handle"
          type="text"
          name="handle"
          value={form?.handle ?? ''}
          placeholder="bluesky handle"
        />
        <button
          class="btn btn-outline-secondary"
          id="searchButton"
          type="submit"
          name="submit"
          value="submit">search</button
        >
      </div>
    </form>
  </div>
</div>

{#if form && !form.success}
<div class="text-center">
  Could not find the account
</div>
{:else if form && form.success}
  <div class="row justify-content-center my-3">
      <div class="col-sm-12 col-md-5 my-3">
        <h5 class="text-center">Blocks [{form.blocks?.sent.length}]</h5>
        <BlocksTable data={form.blocks?.sent ?? []} perPage={15} />
      </div>
      <div class="col-sm-12 col-md-5 my-3">
        <h5 class="text-center">Blocked by [{form.blocks?.rcvd.length}]</h5>
        <BlocksTable data={form.blocks?.rcvd ?? []} perPage={15} />
      </div>
  </div>
{/if}
