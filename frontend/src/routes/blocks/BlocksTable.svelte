<script lang="ts">
  import type { BlockType } from '$lib/types';
  import Pagination from '../Pagination.svelte';
  import UserRow from '../UserRow.svelte';

  export let data: BlockType[] | undefined;
  export let perPage: number = 15;

  let paginatedData: Array<any> = [];
</script>

<Pagination rows={data ?? []} {perPage} bind:trimmedRows={paginatedData} />
<div class="overflow-x-auto">
  <table class="table table-zebra">
    <thead>
      <tr class="text-center text-lg text-primary">
        <th>#</th>
        <th class="text-left">User</th>
        <th>Date</th>
      </tr>
    </thead>
    <tbody>
      {#each paginatedData as row (row._id)}
      <tr class="text-center">
          <td>{row.idx}</td>
          <td class="text-left">
            <UserRow did={row._id} profile={row.profile} />
          </td>
          <td>{new Date(row.createdAt).toLocaleString()}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
