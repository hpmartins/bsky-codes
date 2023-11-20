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
    <div class="text-2xl">{$t('features.top.posters.title')}</div>
    <div class="text-md">{$t('features.common.last_updated', { date })}</div>
  </div>
  <Pagination rows={data?.list ?? []} {perPage} bind:trimmedRows={paginatedData} />
  <div class="overflow-x-auto">
    <table class="table table-zebra">
      <thead>
        <tr class="text-center text-lg text-primary">
          <th>#</th>
          <th class="text-left" title={$t('features.common.user')}>{$t('features.common.user')}</th>
          <th title={$t('features.common.count')}>{$t('features.common.count')}</th>
          <th title={$t('features.common.characters')}><i class="bi bi-hash" /></th>
          <th title={$t('features.common.replies')}><i class="bi bi-chat-square-text-fill" /></th>
          <th title={$t('features.common.likes')}><i class="bi bi-repeat" /></th>
          <th title={$t('features.common.reposts')}><i class="bi bi-heart-fill" /></th>
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
            <td>{row.characters}</td>
            <td>{row.replies}</td>
            <td>{row.reposts}</td>
            <td>{row.likes}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>
