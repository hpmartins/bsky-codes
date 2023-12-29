<script lang="ts">
    import type { PageServerData } from './$types';
    import type { CirclesOptionsType, DateTypeStr, InteractionsDataType, InteractionsDateType } from '$lib/types';

    import dayjs from 'dayjs';
    import isoWeek from 'dayjs/plugin/isoWeek';
    import localizedFormat from 'dayjs/plugin/localizedFormat';

    import { t } from '$lib/translations';
    import { getDateOfIsoWeek } from '$lib/utils';

    import InteractionsTable from './InteractionsTable.svelte';
    import Circles from './Circles.svelte';
    import { goto } from '$app/navigation';

    export let data: PageServerData;

    let inputValue: string;

    let dates:
        | {
              week: number;
              year: number;
              count: number;
          }[]
        | undefined;
    $: ({ dates } = data);
    let selectedDate: string;

    let interactionsData: InteractionsDataType = { found: false };
    let consolidateData = false;

    let circlesOptions: CirclesOptionsType = {
        orbits: 2,
        include_sent: true,
        include_rcvd: true,
        remove_bots: true,
        remove_blocked: true,
        add_watermark: true,
        add_date: true,
        bg_color: '#1D428A',
        add_border: true,
        border_color: '#FFC72C',
    };

    dayjs.extend(isoWeek);
    dayjs.extend(localizedFormat);

    let dateRangeStr = '';
    let circlesDate: InteractionsDateType;

    async function handleSelectedDate() {
        const parsedDate: { week: number; year: number } = JSON.parse(selectedDate);
        const chosenDate = dayjs(getDateOfIsoWeek(parsedDate.week, parsedDate.year));

        interactionsData = await fetch('/api/interactions', {
            method: 'POST',
            body: JSON.stringify({
                did: data.did,
                handle: data.handle,
                weekly: parsedDate,
            }),
            headers: { 'Content-type': 'application/json' },
        }).then((res) => res.json());
        circlesDate = { type: 'weekly', start: chosenDate, end: chosenDate.add(1, 'week') };
        dateRangeStr = `${chosenDate.format('L')} to ${chosenDate.add(1, 'week').format('L')}`;
    }

    async function handleDatePeriod(type: DateTypeStr["type"]) {
        interactionsData = await fetch('/api/interactions', {
            method: 'POST',
            body: JSON.stringify({
                did: data?.did,
                handle: data?.handle,
                range: type,
            }),
            headers: { 'Content-type': 'application/json' },
        }).then((res) => res.json());
        circlesDate = { type: type };
        const dateRangeDict: { [key: string]: string } = {
            all: $t('features.interactions.dates.all'),
            month: $t('features.interactions.dates.month'),
            week: $t('features.interactions.dates.week'),
        };
        dateRangeStr = dateRangeDict[type];
    }

    async function submitHandle() {
        if (inputValue && inputValue.length > 0) {
            goto(`${data.base}/${inputValue.trim().replace(/^@/, '')}`);
        }
    }
</script>

<svelte:head>
    <title>Wolfgang - {$t('features.interactions.pagetitle')}</title>
</svelte:head>

<div class="text-center">
    <p class="text-2xl">{$t('features.interactions.title')}</p>
</div>

<form on:submit|preventDefault={submitHandle}>
    <div class="flex justify-center">
        <div class="join">
            <input
                type="text"
                class="input input-primary join-item"
                name="handle"
                id="handle"
                placeholder={$t('features.common.handle')}
                bind:value={inputValue}
            />
            <button
                class="btn join-item rounded-r-full bg-primary text-secondary normal-case hover:text-primary"
                >{$t('features.common.search')}</button
            >
        </div>
    </div>
</form>

{#if data.handle && data.success}
    {#if data.syncToUpdate}
        <div class="text-center">
            {$t('features.common.syncUpdate')}
        </div>
    {/if}

    <p class="text-2xl">@{data.handle}</p>

    <div class="flex flex-col items-center gap-1">
        <b>{$t('features.interactions.choose_week')}:</b>
        <select
            bind:value={selectedDate}
            on:change={handleSelectedDate}
            class="select select-bordered w-full max-w-xs"
        >
            <option disabled selected />
            {#if dates && dates.length > 0}
                {#each dates as item, idx}
                    {@const itemDate = dayjs(getDateOfIsoWeek(item.week, item.year))}
                    <option value={JSON.stringify(item)}>
                        [{itemDate.format('MMM')}] {item.week}/{item.year} - {item.count}
                    </option>
                {/each}
            {/if}
        </select>
        <b>{$t('features.interactions.choose_range')}:</b>
        <div>
            <a class="link" href={'#'} on:click|preventDefault={() => handleDatePeriod('all')}>
                {$t('features.interactions.dates.all')}
            </a>
            |
            <a class="link" href={'#'} on:click|preventDefault={() => handleDatePeriod('month')}>
                {$t('features.interactions.dates.month')}
            </a>
            |
            <a
                class="link font-bold"
                href={'#'}
                on:click|preventDefault={() => handleDatePeriod('week')}
            >
                {$t('features.interactions.dates.week')}
            </a>
        </div>
    </div>

    {#if interactionsData.found && data.profile}
        <hr />
        <div class="text-center text-2xl font-bold">
            {dateRangeStr}
        </div>
        <details class="collapse bg-base-200">
            <summary
                class="collapse-title text-xl text-center font-medium text-secondary bg-primary"
                >↠ {$t('features.interactions.bolas.title')} ↞</summary
            >
            <div class="collapse-content">
                <div class="flex flex-col justify-center items-center gap-4">
                    <div
                        class="grid grid-cols-1 md:grid-cols-3 gap-4 justify-center p-4 border-4 border-secondary rounded mt-3"
                    >
                        <div>
                            {$t('features.interactions.bolas.include')}:
                            <label class="label cursor-pointer gap-x-3 justify-start">
                                <input
                                    class="checkbox checkbox-sm checkbox-secondary"
                                    type="checkbox"
                                    bind:checked={circlesOptions.include_sent}
                                />
                                <span class="label-text"
                                    >{$t('features.interactions.bolas.sent')}</span
                                >
                            </label>
                            <label class="label cursor-pointer gap-x-3 justify-start">
                                <input
                                    class="checkbox checkbox-sm checkbox-secondary"
                                    type="checkbox"
                                    bind:checked={circlesOptions.include_rcvd}
                                />
                                <span class="label-text"
                                    >{$t('features.interactions.bolas.received')}</span
                                >
                            </label>
                        </div>
                        <div>
                            {$t('features.interactions.bolas.options')}:
                            <label class="label cursor-pointer gap-x-3 justify-start">
                                <input
                                    class="checkbox checkbox-sm checkbox-secondary"
                                    type="checkbox"
                                    bind:checked={circlesOptions.remove_bots}
                                />
                                <span class="label-text"
                                    >{$t('features.interactions.bolas.remove_bots')}</span
                                >
                            </label>
                            <label class="label cursor-pointer gap-x-3 justify-start">
                                <input
                                    class="checkbox checkbox-sm checkbox-secondary"
                                    type="checkbox"
                                    bind:checked={circlesOptions.remove_blocked}
                                />
                                <span class="label-text"
                                    >{$t('features.interactions.bolas.remove_blocked')}</span
                                >
                            </label>
                            <label class="label cursor-pointer gap-x-3 justify-start">
                                <input
                                    class="checkbox checkbox-sm checkbox-secondary"
                                    type="checkbox"
                                    bind:checked={circlesOptions.add_date}
                                />
                                <span class="label-text"
                                    >{$t('features.interactions.bolas.add_date')}</span
                                >
                            </label>
                            <label class="label cursor-pointer gap-x-3 justify-start">
                                <input
                                    class="checkbox checkbox-sm checkbox-secondary"
                                    type="checkbox"
                                    bind:checked={circlesOptions.add_watermark}
                                />
                                <span class="label-text"
                                    >{$t('features.interactions.bolas.add_watermark')}</span
                                >
                            </label>
                        </div>
                        <div>
                            <div>
                                {$t('features.interactions.bolas.orbits')}:
                                <input
                                    type="range"
                                    class="range range-xs range-primary"
                                    min="1"
                                    max="3"
                                    bind:value={circlesOptions.orbits}
                                />
                            </div>
                            <div>
                                {$t('features.interactions.bolas.bg_color')}:
                                <input
                                    type="color"
                                    style="width:100%;"
                                    bind:value={circlesOptions.bg_color}
                                />
                            </div>
                            <div>
                                <label class="flex items-center space-x-2">
                                    <input
                                        class="checkbox checkbox-sm checkbox-secondary"
                                        type="checkbox"
                                        bind:checked={circlesOptions.add_border}
                                    />
                                    <p>{$t('features.interactions.bolas.border_color')}:</p>
                                </label>
                                <input
                                    type="color"
                                    style="width:100%;"
                                    bind:value={circlesOptions.border_color}
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        {#key interactionsData}{#key circlesOptions}
                                <Circles
                                    profile={data.profile}
                                    data={interactionsData}
                                    date={circlesDate}
                                    options={circlesOptions}
                                />
                            {/key}{/key}
                    </div>
                </div>
            </div>
        </details>

        <div class="flex justify-center items-center">
            <span class="label-text text-md pr-2">{$t('features.interactions.separate')}</span>
            <label class="relative inline-flex cursor-pointer items-center">
                <input
                    id="switch"
                    type="checkbox"
                    class="peer sr-only"
                    bind:checked={consolidateData}
                />
                <label for="switch" class="hidden" />
                <div
                    class="peer h-6 w-11 rounded-full border bg-primary after:absolute after:left-[2px] after:top-0.5 after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-secondary peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:ring-green-300"
                />
            </label>
            <span class="label-text text-md pl-2">{$t('features.interactions.consolidate')}</span>
        </div>
        {#if consolidateData}
            <div>
                <div class="text-center text-xl">
                    {$t('features.interactions.table.title.both')}
                </div>
                <InteractionsTable data={interactionsData?.both ?? []} perPage={10} />
            </div>
        {:else}
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                    <div class="text-center text-xl">
                        {$t('features.interactions.table.title.sent')}
                    </div>
                    <InteractionsTable data={interactionsData?.sent ?? []} perPage={10} />
                </div>
                <div>
                    <div class="text-center text-xl">
                        {$t('features.interactions.table.title.rcvd')}
                    </div>
                    <InteractionsTable data={interactionsData?.rcvd ?? []} perPage={10} />
                </div>
            </div>
        {/if}
    {/if}
{:else if data.handle && !data.success}
    <div class="text-center">{$t('features.common.account404')}</div>
{/if}
