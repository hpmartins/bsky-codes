<script lang="ts">
  import type { IDataHistogram } from '@common/db';
  import dayjs from 'dayjs';
  import { onMount } from 'svelte';
  import Plot from 'svelte-plotly.js';

  export let histogram: IDataHistogram[];

  const x = histogram.map((x) => x._id);

  const feedData = [
    {
      x: x,
      y: histogram.map((x) => x.posts),
      name: 'posts',
      type: 'bar',
    },
    {
      x: x,
      y: histogram.map((x) => x.posts_deleted),
      name: 'deleted posts',
      type: 'bar',
    },
  ];

  onMount(() => {
    if (!histogram) return;
  });
</script>

<Plot
  data={feedData}
  layout={{
    margin: { t: 0 },
    barmode: 'stack',
    xaxis: {
      type: 'date',
      side: 'left',
      autorange: false,
      range: [dayjs().subtract(1, 'month').toDate(), dayjs().toDate()],
    },
  }}
  fillParent="width"
  debounce={250}
/>
