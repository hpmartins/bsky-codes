<script lang="ts">
  import dayjs from 'dayjs';
  import { t } from '$lib/translations';
  import Pagination from '../../Pagination.svelte';
  import UserRow from '../../UserRow.svelte';

  export let data: { 
    date: Date;
    list: {[key: string]: number}[]
   } | undefined;

  let paginatedData: any[] = [];

  let removeBots = true;
  $: list = removeBots ? data?.list.filter(x => (x.likes + x.replies) >= x.count).map((x, idx) => ({...x, idx: idx+1})) : data?.list;

  const date = dayjs(data?.date).format('L LT');
</script>

<div class="flex flex-col items-center gap-4">
  <div class="text-center">
    <div class="text-2xl">{$t('features.top.posters.title')}</div>
    <div class="text-md">{$t('features.common.last_updated', { date })}</div>
  </div>
  <div>
    <div class="flex justify-center items-center">
      <label class="relative inline-flex cursor-pointer items-center">
        <input id="switch" type="checkbox" class="peer sr-only" bind:checked={removeBots} />
        <label for="switch" class="hidden" />
        <div
          class="peer h-6 w-11 rounded-full border bg-primary after:absolute after:left-[2px] after:top-0.5 after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-secondary peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:ring-green-300"
        />
      </label>
      <span class="label-text text-md pl-2">{$t('features.top.posters.toggle')}</span>
    </div>
    <div class="mt-1 text-sm">
      bot if (likes + replies) &lt; post count
    </div>
  </div>

  <Pagination rows={list ?? []} perPage={15} bind:trimmedRows={paginatedData} />
  <div class="overflow-x-auto">
    <table class="table table-zebra">
      <thead>
        <tr class="text-center text-lg text-primary">
          <th>#</th>
          <th class="text-left" title={$t('features.common.user')}>{$t('features.common.user')}</th>
          <th title={$t('features.common.count')}>{$t('features.common.count')}</th>
          <th title={$t('features.common.characters')}><i class="bi bi-hash" /></th>
          <th title={$t('features.common.replies')}><i class="bi bi-chat-square-text-fill" /></th>
          <th title={$t('features.common.reposts')}><i class="bi bi-repeat" /></th>
          <th title={$t('features.common.likes')}><i class="bi bi-heart-fill" /></th>
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
