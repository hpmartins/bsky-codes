<script lang="ts">
  import type { BlockType } from '$lib/types';
  import { t, locale } from '$lib/translations';
  import Pagination from '../Pagination.svelte';
  import UserRow from '../UserRow.svelte';

  export let data: BlockType[] | undefined;
  export let perPage: number = 15;

  let paginatedData: Array<any> = [];
</script>

<Pagination rows={data ?? []} {perPage} bind:trimmedRows={paginatedData} />
<div class="overflow-x-auto">
  <table class="table table-xs table-zebra">
    <thead>
      <tr class="text-center text-lg text-primary">
        <th>#</th>
        <th class="text-left" title={$t('features.common.user')}>{$t('features.common.user')}</th>
        <th title={$t('features.common.date')}>{$t('features.common.date')}</th>
      </tr>
    </thead>
    <tbody>
      {#each paginatedData as row (row._id)}
        <tr class="text-center">
          <td>{row.idx}</td>
          <td class="text-left">
            <UserRow did={row._id} profile={row.profile} />
          </td>
          <td>{new Date(row.createdAt).toLocaleString(locale.get())}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
