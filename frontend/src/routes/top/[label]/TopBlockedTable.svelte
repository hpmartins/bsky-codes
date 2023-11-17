<script lang="ts">
  import dayjs from 'dayjs';
  import localizedFormat from 'dayjs/plugin/localizedFormat';
  import Pagination from '../../Pagination.svelte';
  import UserRow from '../../UserRow.svelte';

  export let data: { [key: string]: any } | undefined;
  export let perPage: number = 15;

  dayjs.extend(localizedFormat);

  let paginatedData: Array<any> = [];
</script>

<div class="flex flex-col items-center gap-4">
  <div class="text-center">
    <div class="text-2xl">Top blocked accounts in the last 72 hours</div>
    <div class="text-md">Last updated at {dayjs(data?.date).format('L LT')}</div>
  </div>
  <Pagination rows={data?.list ?? []} {perPage} bind:trimmedRows={paginatedData} />
  <div class="overflow-x-auto">
    <table class="table table-zebra">
      <thead>
        <tr class="text-center text-lg text-primary">
          <th>#</th>
          <th class="text-left">User</th>
          <th>Count</th>
        </tr>
      </thead>
      <tbody>
        {#each paginatedData as row (row._id)}
          <tr class="text-center">
            <td>{row.idx}</td>
            <td class="text-left">
              <UserRow did={row._id} profile={row.profile} />
            </td>
            <td>{row.count}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>
