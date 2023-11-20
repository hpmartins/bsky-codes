<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import { t } from '$lib/translations';
  import BlocksTable from './BlocksTable.svelte';

  import AutoComplete from 'simple-svelte-autocomplete';
  let autocompleteObject:
    | {
        [key: string]: string;
      }
    | undefined;

  export let data: PageData;
  export let form: ActionData;

  async function searchActors(q: string): Promise<{ [key: string]: string }[]> {
    return fetch(`https://api.bsky.app/xrpc/app.bsky.actor.searchActorsTypeahead?q=${q}`).then((res) =>
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
  <title>Wolfgang - {$t('features.blocks.pagetitle')}</title>
</svelte:head>

<div class="md:container md:mx-auto p-12 space-y-8">
  <div class="text-center">
    <p class="text-2xl">{$t('features.blocks.title')}</p>
    <p class="text-lg">{$t('features.blocks.stats', { count: data.count })}</p>
  </div>

  <form method="POST">
    <div class="flex flex-col justify-center items-center">
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
          inputClassName="input input-bordered w-full max-w-xs join-item"
          placeholder="@ {$t('features.common.handle')}"
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
          >{$t('features.common.search')}</button
        >
      </div>
    </div>
  </form>

  {#if form && !form.success}
    <div class="text-center">{$t('features.common.account404')}</div>
  {:else if form && form.success}
    {#if form.syncToUpdate}
      <div class="text-center">
        {$t('features.common.syncUpdate')}
      </div>
    {/if}

    <hr />

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div>
        <h5 class="text-center">{$t('features.blocks.blocked')} [{form.blocks?.sent.length}]</h5>
        <BlocksTable data={form.blocks?.sent ?? []} perPage={15} />
      </div>
      <div class="col-sm-12 col-md-5 my-3">
        <h5 class="text-center">{$t('features.blocks.blockedBy')} [{form.blocks?.rcvd.length}]</h5>
        <BlocksTable data={form.blocks?.rcvd ?? []} perPage={15} />
      </div>
    </div>
  {/if}
</div>
