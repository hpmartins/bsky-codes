<script lang="ts">
  import dayjs from 'dayjs';
  import { t } from '$lib/translations';
  import Plot from 'svelte-plotly.js';
  import type { PageServerData } from './$types';
  import Pagination from '../Pagination.svelte';
  import UserRow from '../UserRow.svelte';

  export let data: PageServerData;

  let totalTablePagData: any[] = [];
  let langTablePagData: any[] = [];
  let posters: any[] = [];
  let selectedLanguage: string;

  const traces = data.totals.slice(0, 10).map((x, idx) => {
    return {
      name: x._id ?? 'none',
      customdata: x._id ?? 'none',
      x: x.list.map((v) => v._id),
      y: x.list.map((v) => v.count),
      yaxis: `y${idx > 0 ? idx + 1 : ''}`,
      hovertemplate: '<b>%{x}</b><br>Count: <b>%{y}</b><br>',
    };
  });

  const table = data.totals.map((x, idx) => ({
    idx: idx + 1,
    lang: x._id,
    count: x.count,
  }));

  const langs = data.totals.map((x) => x._id);

  const onSelectLanguage = async () => {
    if (Number(selectedLanguage) === 0) return;
    const res = await fetch('/api/languages', {
      method: 'POST',
      body: JSON.stringify({ lang: String(selectedLanguage) }),
      headers: { 'Content-type': 'application/json' },
    });
    posters = await res.json();
  };
</script>

<svelte:head>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <script src="https://unpkg.com/cal-heatmap/dist/cal-heatmap.min.js"></script>
  <link rel="stylesheet" href="https://unpkg.com/cal-heatmap/dist/cal-heatmap.css" />
  <link rel="stylesheet" href="/style.css" />
  <title>Wolfgang - {$t('features.languages.pagetitle')}</title>
</svelte:head>

<div class="md:container md:mx-auto p-8 space-y-8">
  <div class="text-center">
    <p class="text-2xl">{$t('features.languages.title')}</p>
  </div>
  <div class="grid sm:grid-cols-6 gap-8">
    <div class="h-96 sm:h-full sm:col-span-4">
      <div class="text-center">
        <p class="text-lg">{$t('features.languages.graphTitle')}</p>
      </div>
      <Plot
        data={traces}
        layout={{
          grid: {
            rows: 10,
            columns: 1,
          },
          xaxis: { fixedrange: true, zeroline: false },
          yaxis: { fixedrange: true, zeroline: false },
          yaxis2: { fixedrange: true, zeroline: false },
          yaxis3: { fixedrange: true, zeroline: false },
          yaxis4: { fixedrange: true, zeroline: false },
          yaxis5: { fixedrange: true, zeroline: false },
          yaxis6: { fixedrange: true, zeroline: false },
          yaxis7: { fixedrange: true, zeroline: false },
          yaxis8: { fixedrange: true, zeroline: false },
          yaxis9: { fixedrange: true, zeroline: false },
          yaxis10: { fixedrange: true, zeroline: false },
          margin: { t: 0, b: 40, l: 0, r: 0 },
        }}
        config={{
          displayModeBar: false,
          scrollZoom: false,
          responsive: true,
        }}
        fillParent={true}
        debounce={250}
      />
    </div>
    <div class="sm:col-span-2">
      <div class="text-center mb-3">
        <p class="text-lg">{$t('features.languages.tableTitle')}</p>
        <p class="text-md">{$t('features.languages.tableSubtitle')}</p>
      </div>
      <Pagination rows={table} perPage={10} bind:trimmedRows={totalTablePagData} />
      <div class="overflow-x-auto">
        <table class="table table-xs table-zebra">
          <thead>
            <tr class="text-center text-lg text-primary">
              <th>#</th>
              <th title={$t('features.common.language')}>{$t('features.common.language')}</th>
              <th title={$t('features.common.total')}>{$t('features.common.total')}</th>
            </tr>
          </thead>
          <tbody>
            {#each totalTablePagData as row (row.lang)}
              <tr class="text-center">
                <td>{row.idx}</td>
                <td>{row.lang ?? 'none'}</td>
                <td>{row.count}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </div>
  <hr />
  <div class="flex flex-col items-center gap-4">
    <div class="text-center">
      <p class="text-lg">{$t('features.languages.postersTitle')}</p>
      <p class="text-md">{$t('features.languages.tableSubtitle')}</p>
    </div>
    <select
      class="select select-primary w-full max-w-xs"
      bind:value={selectedLanguage}
      on:change={onSelectLanguage}
    >
      <option value="XX" disabled selected>{$t('features.languages.selectPlaceholder')}</option>
      {#each langs as lang}
        <option>{lang ?? 'none'}</option>
      {/each}
    </select>

    {#if posters.length > 0}
      <Pagination rows={posters} perPage={20} bind:trimmedRows={langTablePagData} />
      <div class="overflow-x-auto">
        <table class="table table-xs table-zebra">
          <thead>
            <tr class="text-center text-lg text-primary">
              <th>#</th>
              <th title={$t('features.common.user')}>{$t('features.common.user')}</th>
              <th title={$t('features.common.count')}>{$t('features.common.count')}</th>
              <th title={$t('features.common.characters')}><i class="bi bi-hash" /></th>
              <th title={$t('features.common.replies')}><i class="bi bi-chat-square-text-fill" /></th>
              <th title={$t('features.common.reposts')}><i class="bi bi-repeat" /></th>
              <th title={$t('features.common.likes')}><i class="bi bi-heart-fill" /></th>
            </tr>
          </thead>
          <tbody>
            {#each langTablePagData as row (row._id)}
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
    {/if}
  </div>
</div>
