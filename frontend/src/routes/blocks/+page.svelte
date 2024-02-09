<script lang="ts">
    import type { ActionData } from './$types';
    import { t } from '$lib/translations';
    import BlocksTable from './BlocksTable.svelte';
    import { enhance } from '$app/forms';

    export let form: ActionData;

    let inputValue: string;
</script>

<svelte:head>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <script src="https://unpkg.com/cal-heatmap/dist/cal-heatmap.min.js"></script>
    <link rel="stylesheet" href="https://unpkg.com/cal-heatmap/dist/cal-heatmap.css" />
    <title>Wolfgang - {$t('features.blocks.pagetitle')}</title>
</svelte:head>

<div class="text-center">
    <p class="text-2xl">{$t('features.blocks.title')}</p>
</div>

<form method="POST" use:enhance>
    <div class="flex flex-col justify-center items-center">
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
            >
                {$t('features.common.search')}
            </button>
        </div>
    </div>
</form>

{#if form && !form.success}
    <div class="text-center">{$t('features.common.account404')}</div>
{:else if form && form.success}
    {#if form.did == 'did:plc:rjlu6npi554qkz2jcvdt7mc3'}
        <p>
            you need help
        </p>
    {:else}
        <!-- {#if form.syncToUpdate}
            <div class="text-center">
                {$t('features.common.syncUpdate')}
            </div>
        {/if} -->

        <hr />

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
                <h5 class="text-center">
                    {$t('features.blocks.blocked')} [{form.blocks?.sent.length}]
                </h5>
                <BlocksTable data={form.blocks?.sent ?? []} perPage={15} />
            </div>
            <div class="col-sm-12 col-md-5 my-3">
                <h5 class="text-center">
                    {$t('features.blocks.blockedBy')} [{form.blocks?.rcvd.length}]
                </h5>
                <BlocksTable data={form.blocks?.rcvd ?? []} perPage={15} />
            </div>
        </div>
    {/if}
{/if}
