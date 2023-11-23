<script lang="ts">
  import { t } from '$lib/translations';
  import Plot from 'svelte-plotly.js';
  import type { PageServerData } from './$types';
  import Pagination from '#/Pagination.svelte';

  export let data: PageServerData;
  let totalTablePagData: any[] = [];
</script>

<svelte:head>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <script src="https://unpkg.com/cal-heatmap/dist/cal-heatmap.min.js"></script>
  <link rel="stylesheet" href="https://unpkg.com/cal-heatmap/dist/cal-heatmap.css" />
  <link rel="stylesheet" href="/style.css" />
  <title>Wolfgang - {$t('features.languages.pagetitle')}</title>
</svelte:head>

<div class="text-center">
  <p class="text-2xl">{$t('features.languages.title')}</p>
  <p class="text-lg">{$t('features.languages.tableTitle')} - {$t('features.languages.tableSubtitle')}</p>
</div>

<div class="grid grid-cols-5 w-full max-w-full md:max-w-4xl gap-8">
  <div class="col-span-5 md:col-span-3">
    <div class="w-full pl-5 md:pl-0" style={'height: 40rem;'}>
      <Plot
        data={data.traces}
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
          margin: { t: 10, b: 0, l: 0, r: 0 },
          legend: {
            orientation: 'h',
          },
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
  </div>
  <div class="col-span-5 md:col-span-2">
    <Pagination rows={data.table} perPage={20} bind:trimmedRows={totalTablePagData} />
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
              <td>{row.lang ?? 'none'}{row.langName.length > 0 ? ` (${row.langName})` : ''}</td>
              <td>{row.count}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
</div>
