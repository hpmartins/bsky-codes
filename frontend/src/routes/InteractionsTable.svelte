<script lang="ts">
  import type { InteractionsType } from '$lib/types';
  import Pagination from './Pagination.svelte';
  import UserRow from './UserRow.svelte';

  export let data: InteractionsType[] | undefined;
  export let perPage: number = 15;

  let paginatedData: Array<any> = [];
</script>

<Pagination rows={data ?? []} {perPage} bind:trimmedRows={paginatedData} />
<table class="table table-striped table-hover table-sm table-fixed mt-2">
  <thead>
    <tr style="text-align: center; vertical-align: middle">
      <th>#</th>
      <th>User</th>
      <th><i class="bi bi-hash" /></th>
      <th><i class="bi bi-chat-square-text-fill" /></th>
      <th><i class="bi bi-repeat" /></th>
      <th><i class="bi bi-heart-fill" /></th>
      <th title="subtotal">total</th>
    </tr>
  </thead>
  <tbody>
    {#each paginatedData as row (row._id)}
      <tr style="text-align: center; vertical-align: middle">
        <td style="font-size: 0.85rem">{row.idx}</td>
        <td style="text-align: left">
          <UserRow did={row._id} profile={row.profile} />
        </td>
        <td style="font-size: 0.85rem">{row.characters}</td>
        <td style="font-size: 0.85rem">{row.replies}</td>
        <td style="font-size: 0.85rem">{row.reposts}</td>
        <td style="font-size: 0.85rem">{row.likes}</td>
        <td style="font-size: 0.85rem">{row.points}</td>
      </tr>
    {/each}
  </tbody>
</table>
