<script lang="ts">
  import { onMount } from 'svelte';
  import dayjs from 'dayjs';
  import isoWeek from 'dayjs/plugin/isoWeek';
  import localizedFormat from 'dayjs/plugin/localizedFormat';
  import type { ActionData, PageData, SubmitFunction } from './$types';
  import CalHeatmap from 'cal-heatmap';
  import { getDateOfIsoWeek } from '$lib/utils';
  import InteractionsTable from './InteractionsTable.svelte';
  import type { CirclesOptionsType, InteractionsDataType } from '$lib/types';
  import Circles from './Circles.svelte';
  import AutoComplete from 'simple-svelte-autocomplete';
  import type { InteractionsType } from '@common/queries';

  export let data: PageData;
  export let form: ActionData;

  let autocompleteObject:
    | {
        [key: string]: string;
      }
    | undefined;

  let interactionsData: InteractionsDataType = { found: false };
  let consolidateData = false;

  let cOptions: CirclesOptionsType = {
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
          handle: form?.handle,
          weekly: {
            week: date.isoWeek(),
            year: date.isoWeekYear(),
          },
        }),
        headers: { 'Content-type': 'application/json' },
      });
      const res = await test.json();
      interactionsData = {
        found: true,
        date: { type: 'weekly', start: date.subtract(1, 'week'), end: date },
        sent: res.sent as InteractionsType[],
        rcvd: res.rcvd as InteractionsType[],
        both: res.both as InteractionsType[],
      };
      dateRangeStr = `${dayjs(interactionsData.date?.start).format('L')} to ${dayjs(
        interactionsData.date?.end,
      ).format('L')}`;
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
          textAlign: 'middle',
        },
      },
      subDomain: { type: 'week', label: 'W', width: 25, height: 35 },
      data: {
        source: form?.dates,
        x: (dt: { week: number; year: number }) => {
          return getDateOfIsoWeek(dt.week, dt.year);
        },
        y: 'count',
      },
      verticalOrientation: false,
      scale: {
        color: {
          type: 'linear',
          domain: [0, Math.max.apply(null, Object.values(form?.dates?.map((x) => x.count) ?? []))],
        },
      },
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
        handle: form?.handle,
        range: type,
      }),
      headers: { 'Content-type': 'application/json' },
    });
    const res = await test.json();
    interactionsData = {
      found: true,
      date: { type: type },
      sent: res.sent as InteractionsType[],
      rcvd: res.rcvd as InteractionsType[],
      both: res.both as InteractionsType[],
    };
    const dateRangeDict: { [key: string]: string } = {
      all: 'All time',
      month: 'Last 30 days',
      week: 'Last 7 days',
      day: 'Last 24 hours (approx.)',
    };
    dateRangeStr = dateRangeDict[type];
  }

  async function searchActors(q: string): Promise<{ [key: string]: string }[]> {
    return fetch(
      'https://api.bsky.app/xrpc/app.bsky.actor.searchActorsTypeahead?q=' + encodeURIComponent(q),
    ).then((res) =>
      res
        .json()
        .then((data) =>
          data.actors.map((x: { [key: string]: string }) => ({ ...x, value: JSON.stringify(x) })),
        ),
    );
  }
</script>

<svelte:head>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <script src="https://unpkg.com/cal-heatmap/dist/cal-heatmap.min.js"></script>
  <link rel="stylesheet" href="https://unpkg.com/cal-heatmap/dist/cal-heatmap.css" />
  <link rel="stylesheet" href="/style.css" />
  <title>Wolfgang - Interactions</title>
</svelte:head>

<div class="md:container md:mx-auto p-12 space-y-8">
  <div class="text-center">
    <p class="text-2xl">Interactions</p>
    <p class="text-lg">{data.count} unique items</p>
  </div>

  <form method="POST">
    <div class="flex justify-center">
      <div class="join">
        <AutoComplete
          selectName="actor"
          searchFunction={searchActors}
          delay="200"
          localFiltering={false}
          cleanUserText={false}
          labelFieldName="handle"
          valueFieldName="value"
          bind:value={autocompleteObject}
          noInputStyles={true}
          inputClassName="flex input input-bordered join-item"
          placeholder="@ bluesky handle"
        >
          <div slot="item" let:item let:label>
            {@const displayName = item.displayName ?? item.handle ?? ''}
            <div class="flex items-center space-x-2 text-xs">
              <div class="avatar">
                <div class="mask mask-squircle w-7 h-7">
                  {#if item.avatar}
                    <img alt={''} src={item.avatar} />
                  {:else}
                    <i class="bi bi-person" style="font-size: 1.5rem" />
                  {/if}
                </div>
              </div>
              <div>
                <div class="font-bold">{displayName}</div>
                <div class="opacity-50">@{@html label}</div>
              </div>
            </div>
          </div>
        </AutoComplete>
        <button class="btn join-item rounded-r-full bg-primary text-secondary normal-case hover:text-primary"
          >Search</button
        >
      </div>
    </div>
  </form>

  {#if form && !form.success}
    <div class="text-center">Could not find the account</div>
  {:else if form && form.success}
    <div class="text-center">
      {form?.syncToUpdate ? 'The profile has been marked for update. Check again in a few minutes.' : ''}
    </div>

    <hr />
    <div class="flex flex-col items-center gap-1">
      <b>Choose a week:</b>
      <div class="join">
        <button class="join-item btn btn-xs" on:click|preventDefault={handlePrevious}>
          <i class="bi bi-chevron-double-left" /> prev
        </button>
        <button class="join-item btn btn-xs" on:click|preventDefault={handleNext}>
          next <i class="bi bi-chevron-double-right" />
        </button>
      </div>
      <div class="flex justify-center items-center">
        <div id="interactions-heatmap" class="max-w-sm" />
      </div>
      <b>... or a specific date period:</b>
      <div>
        <a class="link" href={'#'} on:click|preventDefault={() => handleDatePeriod('all')}> all time </a>
        |
        <a class="link" href={'#'} on:click|preventDefault={() => handleDatePeriod('month')}> last month </a>
        |
        <a class="link" href={'#'} on:click|preventDefault={() => handleDatePeriod('week')}> last 7 days </a>
        |
        <a class="link" href={'#'} on:click|preventDefault={() => handleDatePeriod('day')}> last 24 hours </a>
      </div>
    </div>

    {#if interactionsData.found && form.profile}
      <hr />
      <div class="text-center text-2xl font-bold">
        {dateRangeStr}
      </div>
      <details class="collapse bg-base-200">
        <summary class="collapse-title text-xl text-center font-medium"> Bolas </summary>
        <div class="collapse-content">
          <div class="flex flex-col justify-center items-center gap-4">
            <div
              class="grid grid-cols-1 md:grid-cols-3 gap-4 justify-center p-4 border-4 border-secondary rounded"
            >
              <div>
                Include:
                <label class="label cursor-pointer gap-x-3 justify-start">
                  <input
                    class="checkbox checkbox-sm checkbox-secondary"
                    type="checkbox"
                    bind:checked={cOptions.include_sent}
                  />
                  <span class="label-text">Sent</span>
                </label>
                <label class="label cursor-pointer gap-x-3 justify-start">
                  <input
                    class="checkbox checkbox-sm checkbox-secondary"
                    type="checkbox"
                    bind:checked={cOptions.include_rcvd}
                  />
                  <span class="label-text">Received</span>
                </label>
              </div>
              <div>
                Options:
                <label class="label cursor-pointer gap-x-3 justify-start">
                  <input
                    class="checkbox checkbox-sm checkbox-secondary"
                    type="checkbox"
                    bind:checked={cOptions.remove_bots}
                  />
                  <span class="label-text">Remove main bots</span>
                </label>
                <label class="label cursor-pointer gap-x-3 justify-start">
                  <input
                    class="checkbox checkbox-sm checkbox-secondary"
                    type="checkbox"
                    bind:checked={cOptions.add_date}
                  />
                  <span class="label-text">Add date</span>
                </label>
                <label class="label cursor-pointer gap-x-3 justify-start">
                  <input
                    class="checkbox checkbox-sm checkbox-secondary"
                    type="checkbox"
                    bind:checked={cOptions.add_watermark}
                  />
                  <span class="label-text">Add watermark</span>
                </label>
              </div>
              <div>
                <div>
                  Orbits:
                  <input
                    type="range"
                    class="range range-xs range-primary"
                    min="1"
                    max="3"
                    bind:value={cOptions.orbits}
                  />
                </div>
                <div>
                  Background color:
                  <input type="color" style="width:100%;" bind:value={cOptions.bg_color} />
                </div>
                <div>
                  <label class="flex items-center space-x-2">
                    <input
                      class="checkbox checkbox-sm checkbox-secondary"
                      type="checkbox"
                      bind:checked={cOptions.add_border}
                    />
                    <p>Border color:</p>
                  </label>
                  <input type="color" style="width:100%;" bind:value={cOptions.border_color} />
                </div>
              </div>
            </div>

            <div>
              {#key interactionsData}{#key cOptions}
                  <Circles profile={form.profile} data={interactionsData} options={cOptions} />
                {/key}{/key}
            </div>
          </div>
        </div>
      </details>

      <div class="flex justify-center items-center">
        <span class="label-text text-md pr-2">Separate</span>
        <label class="relative inline-flex cursor-pointer items-center">
          <input id="switch" type="checkbox" class="peer sr-only" bind:checked={consolidateData} />
          <label for="switch" class="hidden" />
          <div
            class="peer h-6 w-11 rounded-full border bg-primary after:absolute after:left-[2px] after:top-0.5 after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-secondary peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:ring-green-300"
          />
        </label>
        <span class="label-text text-md pl-2">Consolidate</span>
      </div>
      {#if consolidateData}
        <div>
          <div class="text-center text-xl">Sent + Received</div>
          <InteractionsTable data={interactionsData?.both ?? []} perPage={10} />
        </div>
      {:else}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <div class="text-center text-xl">Sent</div>
            <InteractionsTable data={interactionsData?.sent ?? []} perPage={10} />
          </div>
          <div>
            <div class="text-center text-xl">Received</div>
            <InteractionsTable data={interactionsData?.rcvd ?? []} perPage={10} />
          </div>
        </div>
      {/if}
    {/if}
  {/if}
</div>
