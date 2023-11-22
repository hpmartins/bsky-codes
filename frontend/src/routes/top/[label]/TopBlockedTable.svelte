<script lang="ts">
  import dayjs from 'dayjs';
  import { t } from '$lib/translations';
  import Pagination from '../../Pagination.svelte';
  import UserRow from '../../UserRow.svelte';

  export let data: { [key: string]: any } | undefined;
  export let perPage: number = 15;

  let paginatedData: any[] = [];

  const date = dayjs(data?.date).format('L LT');
</script>

<div class="flex flex-col items-center gap-4">
  <div class="text-center">
    <div class="text-2xl">{$t('features.top.blocked.title')}</div>
    <div class="text-md">{$t('features.common.last_updated', { date })}</div>
  </div>
  <Pagination rows={data?.list ?? []} {perPage} bind:trimmedRows={paginatedData} />
  <div class="overflow-x-auto">
    <table class="table table-xs table-zebra">
      <thead>
        <tr class="text-center text-lg text-primary">
          <th>#</th>
          <th title={$t('features.common.user')}>{$t('features.common.user')}</th>
          <th title={$t('features.common.count')}>{$t('features.common.count')}</th>
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
