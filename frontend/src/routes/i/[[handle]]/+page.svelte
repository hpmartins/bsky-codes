<script lang="ts">
  import type { PageProps } from "./$types";
  import type { CirclesOptionsType, InteractionsDataType } from "$lib/types";

  import { t } from "$lib/translations";
  import InteractionsTable from "#/InteractionsTable.svelte";
  import { goto } from "$app/navigation";
  import { navigating } from "$app/state";

  let { data }: PageProps = $props();
  let inputHandle: string = $state(data.handle ?? "");

  let modifiedData: InteractionsDataType | null = $state(null);
  let groupedIds: string[][] = [];
  let fetchedData: Record<string, any> = {};


  const SHOW_LOADING_DELAY_MS = 300;
  let showLoadingRef: number;
  let showLoading = $state(false);

  $effect(() => {
    clearTimeout(showLoadingRef);
    if (navigating.complete == null) {
      showLoading = false;
    } else {
      showLoadingRef = setTimeout(() => {
        modifiedData = null;
        showLoading = true;
      }, SHOW_LOADING_DELAY_MS);
    }
  });

  let circlesOptions: CirclesOptionsType = $state({
    orbits: 2,
    include_sent: true,
    include_rcvd: false,
    add_watermark: true,
    add_date: true,
    bg_color: "#1D428A",
    add_border: true,
    border_color: "#FFC72C",
  });

  $effect(() => {
    if (data.success && data.interactions) {
      modifiedData = JSON.parse(JSON.stringify(data.interactions));

      const allIds = new Set<string>();
      data.interactions.sent.forEach((item) => allIds.add(item._id));
      data.interactions.rcvd.forEach((item) => allIds.add(item._id));
      const uniqueIds = Array.from(allIds);

      groupedIds = [];
      for (let i = 0; i < uniqueIds.length; i += 25) {
        groupedIds.push(uniqueIds.slice(i, i + 25));
      }

      const fetchPromises = groupedIds.map(async (idBlock) => {
        const url = new URL("https://public.api.bsky.app/xrpc/app.bsky.actor.getProfiles");
        idBlock.forEach((id) => url.searchParams.append("actors", id));
        try {
          const response = await fetch(url.toString());
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          const { profiles } = await response.json();

          profiles.forEach((profile: { [key: string]: any }) => {
            fetchedData[profile.did] = {
              avatar: profile.avatar,
              display_name: profile.displayName,
              handle: profile.handle,
            };
          });
        } catch (error) {
          console.error("Error fetching data:", error);
        }
      });

      Promise.all(fetchPromises)
        .then(() => {
          if (modifiedData) {
            modifiedData.sent.forEach((item) => {
              if (fetchedData[item._id]) {
                item.profile = fetchedData[item._id];
              }
            });

            modifiedData.rcvd.forEach((item) => {
              if (fetchedData[item._id]) {
                item.profile = fetchedData[item._id];
              }
            });
          }
        })
        .catch((error) => {
          console.error("Error in Promise.all:", error);
        });
    }
  });

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (inputHandle && inputHandle.length > 0) {
      goto(`/i/${inputHandle.trim().replace(/^@/, "")}`, { invalidateAll: true });
    }
  }
</script>

<svelte:head>
  <title>Wolfgang - {$t("stuff.layout.navbar.interactions")}</title>
</svelte:head>

<div class="p-2 flex flex-col items-center border rounded-md w-full">
  <p class="pb-2 text-xl font-bold">{$t('stuff.interactions.title')}</p>
  <form onsubmit={handleSubmit}>
    <div class="join">
      <input
        class="input input-primary join-item"
        type="text"
        name="handle"
        placeholder={$t("stuff.common.handle")}
        bind:value={inputHandle}
      />
      <button class="btn btn-primary join-item">{$t("stuff.common.search")}</button>
    </div>
  </form>

  {#if showLoading}
  <p class="pt-2">{$t('stuff.interactions.loading')}</p>
  <p class="pt-2">{$t('stuff.interactions.loadingMsg')}</p>
    <span class="loading loading-infinity loading-lg"></span>
  {/if}
  {#if data.success && modifiedData}
    <p class="pt-2 font-bold text-lg">@{data.handle}</p>
    <p class="font-bold text-lg">{$t("stuff.interactions.dates.week")}</p>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
      <div class="flex flex-col items-center">
        <p class="text-xl text-primary text-bold">{$t("stuff.interactions.table.sent")}</p>
        <InteractionsTable data={modifiedData.sent} perPage={10} />
      </div>
      <div class="flex flex-col items-center">
        <p class="text-xl text-primary text-bold">{$t("stuff.interactions.table.rcvd")}</p>
        <InteractionsTable data={modifiedData.rcvd} perPage={10} />
      </div>
    </div>
  {:else}
    <p>{data.error}</p>
  {/if}
</div>
<!-- <details class="collapse bg-base-200">
    <summary class="collapse-title text-xl text-center font-medium text-secondary bg-primary">
      {$t("features.interactions.bolas.title")}
    </summary>
    <div class="collapse-content">
      <div class="flex flex-col justify-center items-center gap-4">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 justify-center p-4 border-4 border-secondary rounded mt-3">
          <div>
            {$t("features.interactions.bolas.include")}:
            <label class="label cursor-pointer gap-x-3 justify-start">
              <input
                class="checkbox checkbox-sm checkbox-secondary"
                type="checkbox"
                bind:checked={circlesOptions.include_sent}
              />
              <span class="label-text">{$t("features.interactions.bolas.sent")}</span>
            </label>
            <label class="label cursor-pointer gap-x-3 justify-start">
              <input
                class="checkbox checkbox-sm checkbox-secondary"
                type="checkbox"
                bind:checked={circlesOptions.include_rcvd}
              />
              <span class="label-text">{$t("features.interactions.bolas.received")}</span>
            </label>
          </div>
          <div>
            {$t("features.interactions.bolas.options")}:
            <label class="label cursor-pointer gap-x-3 justify-start">
              <input
                class="checkbox checkbox-sm checkbox-secondary"
                type="checkbox"
                bind:checked={circlesOptions.add_date}
              />
              <span class="label-text">{$t("features.interactions.bolas.add_date")}</span>
            </label>
            <label class="label cursor-pointer gap-x-3 justify-start">
              <input
                class="checkbox checkbox-sm checkbox-secondary"
                type="checkbox"
                bind:checked={circlesOptions.add_watermark}
              />
              <span class="label-text">{$t("features.interactions.bolas.add_watermark")}</span>
            </label>
          </div>
          <div>
            <div>
              {$t("features.interactions.bolas.orbits")}:
              <input
                type="range"
                class="range range-xs range-primary"
                min="1"
                max="3"
                bind:value={circlesOptions.orbits}
              />
            </div>
            <div>
              {$t("features.interactions.bolas.bg_color")}:
              <input type="color" style="width:100%;" bind:value={circlesOptions.bg_color} />
            </div>
            <div>
              <label class="flex items-center space-x-2">
                <input
                  class="checkbox checkbox-sm checkbox-secondary"
                  type="checkbox"
                  bind:checked={circlesOptions.add_border}
                />
                <p>{$t("features.interactions.bolas.border_color")}:</p>
              </label>
              <input type="color" style="width:100%;" bind:value={circlesOptions.border_color} />
            </div>
          </div>
        </div>

        <div>
          {#key data}{#key circlesOptions}
              <Circles profile={data.interactions} data={data.interactions} options={circlesOptions} />
            {/key}{/key}
        </div>
      </div>
    </div>
  </details> -->
