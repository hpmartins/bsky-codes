<script lang="ts">
  import dayjs from 'dayjs';
  import localizedFormat from 'dayjs/plugin/localizedFormat';
  import Pagination from '../../Pagination.svelte';
  import UserRow from '../../UserRow.svelte';

  export let data: {[key: string]: any} | undefined;
  export let perPage: number = 15;

  dayjs.extend(localizedFormat)

  let paginatedData: Array<any> = [];
</script>

<h4 class="text-center">Top posters in the last 6 hours</h4>

<h6 class="text-center">Last updated at {dayjs(data?.date).format('L LT')}</h6>

<Pagination rows={data?.list ?? []} {perPage} bind:trimmedRows={paginatedData} />
<table class="table table-striped table-hover table-sm table-fixed mt-2">
  <thead>
    <tr style="text-align: center; vertical-align: middle">
      <th>#</th>
      <th>User</th>
      <th>Count</th>
      <th><i class="bi bi-hash" /></th>
      <th><i class="bi bi-chat-square-text-fill" /></th>
      <th><i class="bi bi-repeat" /></th>
      <th><i class="bi bi-heart-fill" /></th>
    </tr>
  </thead>
  <tbody>
    {#each paginatedData as row (row._id)}
      <tr style="text-align: center; vertical-align: middle">
        <td style="font-size: 0.85rem">{row.idx}</td>
        <td style="text-align: left">
          <UserRow did={row._id} profile={row.profile} />
        </td>
        <td style="font-size: 0.85rem">{row.count}</td>
        <td style="font-size: 0.85rem">{row.characters}</td>
        <td style="font-size: 0.85rem">{row.replies}</td>
        <td style="font-size: 0.85rem">{row.reposts}</td>
        <td style="font-size: 0.85rem">{row.likes}</td>
      </tr>
    {/each}
  </tbody>
</table>
