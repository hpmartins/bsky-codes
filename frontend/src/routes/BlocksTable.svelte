<script lang="ts">
    import type { BlockType } from "$lib/types";
    import Pagination from "./Pagination.svelte";
    import UserRow from "./UserRow.svelte";

    export let data: BlockType[] | undefined;
    export let perPage: number = 15;

    let paginatedData : Array<any> = [];
</script>


<table class="table table-striped table-hover table-sm table-fixed mt-2">
    <thead>
      <tr style="text-align: center; vertical-align: middle">
        <th>#</th>
        <th>User</th>
        <th style="width: 18%;">Date</th>
      </tr>
    </thead>
    <tbody>
      {#each paginatedData as row (row._id)}
        <tr style="text-align: center; vertical-align: middle">
          <td>{row.idx}</td>
          <td style="text-align: left">
            <UserRow did={row._id} profile={row.profile} />
          </td>
          <td style="font-size: 0.80rem">{new Date(row.createdAt).toLocaleString()}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  <Pagination rows={data ?? []} perPage={perPage} bind:trimmedRows={paginatedData} />
