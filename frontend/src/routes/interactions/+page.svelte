<script lang="ts">
  import { onMount } from 'svelte';
  import dayjs from 'dayjs';
  import isoWeek from 'dayjs/plugin/isoWeek';
  import localizedFormat from 'dayjs/plugin/localizedFormat';
  import type { ActionData, PageData } from './$types';
  import CalHeatmap from 'cal-heatmap';
  import { getDateOfIsoWeek } from '$lib/utils';
  import InteractionsTable from '../InteractionsTable.svelte';
  import type { CirclesOptionsType, InteractionsDataType, InteractionsType } from '$lib/types';
  import Circles from '../Circles.svelte';

  export let data: PageData;
  export let form: ActionData;

  let interactionsData: InteractionsDataType = { found: false };

  let circlesOptions: CirclesOptionsType = {
    orbits: 2,
    include_sent: true,
    include_rcvd: true,
    remove_bots: true,
    add_watermark: true,
    add_date: true,
    bg_color: '#1D428A',
    add_border: true,
    border_color: '#FFC72C',
  };

  dayjs.extend(isoWeek);
  dayjs.extend(localizedFormat);

  const cal: CalHeatmap = new CalHeatmap();

  let dateRangeStr = '';

  onMount(async () => {
    cal.on('click', async (event, timestamp, value) => {
      const date = dayjs(timestamp).add(1, 'w');
      const test = await fetch('/api/interactions', {
        method: 'POST',
        body: JSON.stringify({
          did: form?.did,
          weekly: {
            week: date.isoWeek(),
            year: date.isoWeekYear(),
          }
        }),
        headers: { 'Content-type': 'application/json' }
      });
      const res = await test.json();
      interactionsData = {
        found: true,
        date: { type: 'weekly', start: date.subtract(1, 'week'), end: date },
        sent: res.sent as InteractionsType[],
        rcvd: res.rcvd as InteractionsType[]
      };
      dateRangeStr = `${dayjs(interactionsData.date?.start).format('L')} to ${dayjs(
        interactionsData.date?.end
      ).format('L')}`
    });

    await cal.paint({
      range: 3,
      date: {
        locale: { weekStart: 1 },
        min: dayjs('2022-11-01'),
        max: dayjs(),
        start: dayjs('2022-11-01'),
      },
      itemSelector: '#interactions-heatmap',
      domain: {
        type: 'month',
        label: {
          textAlign: 'middle'
        }
      },
      subDomain: { type: 'week', label: 'W', width: 25, height: 35 },
      data: {
        source: form?.dates,
        x: (dt: {week: number, year: number}) => { return getDateOfIsoWeek(dt.week, dt.year) },
        y: 'count'
      },
      verticalOrientation: false,
      scale: {
        color: {
          type: 'linear',
          domain: [0, Math.max.apply(null, Object.values(form?.dates?.map((x) => x.count) ?? []))]
        }
      }
    });

    await cal.jumpTo(new Date());
  });

  async function handlePrevious() {
    cal.previous();
  }
  async function handleNext() {
    cal.next();
  }

  async function handleDatePeriod(type: string) {
    const test = await fetch('/api/interactions', {
        method: 'POST',
        body: JSON.stringify({
          did: form?.did,
          range: type,
        }),
        headers: { 'Content-type': 'application/json' }
      });
      const res = await test.json();
      interactionsData = {
        found: true,
        date: { type: type },
        sent: res.sent as InteractionsType[],
        rcvd: res.rcvd as InteractionsType[]
      };
      const dateRangeDict: {[key: string]: string} = {
        'all': 'All time',
        'month': 'Last 30 days',
        'week': 'Last 7 days',
        'day': 'Last 24 hours (approx.)',
      }
      dateRangeStr = dateRangeDict[type]
  }
</script>

<svelte:head>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <script src="https://unpkg.com/cal-heatmap/dist/cal-heatmap.min.js"></script>
  <link rel="stylesheet" href="https://unpkg.com/cal-heatmap/dist/cal-heatmap.css" />
  <title>Wolfgang - Interactions</title>
</svelte:head>

<h3 class="text-center">Interactions</h3>

<h5 class="text-center">{data.count} unique interactions</h5>

<div class="row align-items-center justify-content-center my-3">
  <div class="col-sm-12 col-md-5">
    <form id="form" method="post">
      <div class="input-group input-group-xl">
        <span class="input-group-text">@</span>
        <input
          class="form-control"
          id="handle"
          type="text"
          name="handle"
          value={form?.handle ?? ''}
          placeholder="bluesky handle"
        />
        <button
          class="btn btn-outline-secondary"
          id="searchButton"
          type="submit"
          name="submit"
          value="submit">search</button
        >
      </div>
    </form>
  </div>
</div>

{#if form && !form.success}
<div class="text-center">
  Could not find the account
</div>
{:else if form && form.success}
  <div class="text-center">
    {form?.syncToUpdate ? "The profile has been marked for update. Check again in a few minutes." : "" }
  </div>

  <hr>
  <div class="text-center">
    <b>Choose a week:</b>
    <div style="font-size: 0.8rem">
        <a href={'#'} on:click|preventDefault={handlePrevious}>
          <i class="bi bi-chevron-double-left"></i> prev
        </a>
        |
        <a href={'#'} on:click|preventDefault={handleNext}>
          next <i class="bi bi-chevron-double-right"></i>
        </a>
    </div>
    <div class="row align-items-center justify-content-center mt-1">
      <div class="col-sm-auto col-md-auto">
          <div
            id="interactions-heatmap"
            class="align-items-center justify-content-center"
          />      
      </div>
    </div>
  </div>
  <div class="text-center mt-2">
    <b>... or a specific date period:</b>
    <div>
        <a href={'#'} on:click|preventDefault={() => handleDatePeriod('all')}>
          all time
        </a>
        |
        <a href={'#'} on:click|preventDefault={() => handleDatePeriod('month')}>
          last month
        </a>
        |
        <a href={'#'} on:click|preventDefault={() => handleDatePeriod('week')}>
          last 7 days
        </a>
        |
        <a href={'#'} on:click|preventDefault={() => handleDatePeriod('day')}>
          last 24 hours
        </a>
    </div>
    <div class="row align-items-center justify-content-center mt-1">
      <div class="col-sm-auto col-md-auto">
          <div
            id="interactions-heatmap"
            class="align-items-center justify-content-center"
          />      
      </div>
    </div>
  </div>

  {#if interactionsData.found && form.profile}
    <hr>
    <h5 class="text-center">
      {dateRangeStr}
    </h5>
    <p class="text-center">
      <button
        class="btn btn-primary"
        style="color: #1D428A; background-color: #FFC72C"
        type="button"
        data-bs-toggle="collapse"
        data-bs-target="#collapseCircles"
        aria-expanded="false"
        aria-controls="collapseCircles"
      >
        Circles
      </button>
    </p>
    <div class="collapse my-2" id="collapseCircles">
      <div class="row justify-content-center">
        <div class="col-sm-12 col-md-3 mb-3">
          <label for="orbitsRange" class="form-label"># of orbits</label>
          <input
            type="range"
            class="form-range"
            min="1"
            max="3"
            value="2"
            id="orbitsRange"
            on:change={(e) => (circlesOptions.orbits = e?.target?.valueAsNumber)}
          />

          Include:
          <div class="form-check form-switch">
            <input
              class="form-check-input"
              type="checkbox"
              role="switch"
              id="circlesIncludeSent"
              on:change={(e) => (circlesOptions.include_sent = e?.target?.checked)}
              checked
            />
            <label class="form-check-label" for="circlesIncludeSent">Sent</label>
          </div>

          <div class="form-check form-switch">
            <input
              class="form-check-input"
              type="checkbox"
              role="switch"
              id="circlesIncludeRcvd"
              on:change={(e) => (circlesOptions.include_rcvd = e?.target?.checked)}
              checked
            />
            <label class="form-check-label" for="circlesIncludeRcvd">Received</label>
          </div>

          and:
          <div class="form-check form-switch">
            <input
              class="form-check-input"
              type="checkbox"
              role="switch"
              id="circlesRemoveBots"
              on:change={(e) => (circlesOptions.remove_bots = e?.target?.checked)}
              checked
            />
            <label class="form-check-label" for="circlesRemoveBots">Remove main bots</label>
          </div>

          <div class="form-check form-switch">
            <input
              class="form-check-input"
              type="checkbox"
              role="switch"
              id="circlesDate"
              on:change={(e) => (circlesOptions.add_date = e?.target?.checked)}
              checked
            />
            <label class="form-check-label" for="circlesDate">Add date</label>
          </div>

          <div class="form-check form-switch">
            <input
              class="form-check-input"
              type="checkbox"
              role="switch"
              id="circlesWatermark"
              on:change={(e) => (circlesOptions.add_watermark = e?.target?.checked)}
              checked
            />
            <label class="form-check-label" for="circlesWatermark">Add watermark</label>
          </div>

          <label for="circlesBGColor" class="form-label mt-1">Background color:</label>
          <input
            type="color"
            class="form-control"
            id="circlesBGColor"
            value="#1D428A"
            style="width:30%;"
            on:input={(e) => (circlesOptions.bg_color = e?.target?.value)}
          />

          <div class="form-check form-switch mt-2">
            <input
              class="form-check-input"
              type="checkbox"
              role="switch"
              id="circlesBorder"
              on:change={(e) => (circlesOptions.add_border = e?.target?.checked)}
              checked
            />
            <label class="form-check-label" for="circlesBorder">Add border:</label>
          </div>
          <input
            type="color"
            class="form-control"
            id="circlesBorderColor"
            value="#FFC72C"
            style="width:30%;"
            on:input={(e) => (circlesOptions.border_color = e?.target?.value)}
          />

        </div>
        <div class="col-sm-12 col-md-6 mb-3 word-wrap">
          {#key interactionsData}{#key circlesOptions}
              <Circles profile={form.profile} data={interactionsData} options={circlesOptions} />
            {/key}{/key}
        </div>
      </div>
    </div>
    <div class="row justify-content-center">
      <div class="col-sm-12 col-md-6 mb-3">
        <h5 class="text-center">Sent</h5>
        <InteractionsTable data={interactionsData?.sent ?? []} perPage={10} />
      </div>
      <div class="col-sm-12 col-md-6 mb-3">
        <h5 class="text-center">Received</h5>
        <InteractionsTable data={interactionsData?.rcvd ?? []} perPage={10} />
      </div>
    </div>
  {/if}
{/if}
