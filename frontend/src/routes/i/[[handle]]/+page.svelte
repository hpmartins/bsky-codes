<script lang="ts">
  import type { PageProps } from "./$types";
  import type { InteractionsDataType, InteractionsType, SimpleProfileType } from "$lib/types";

  import { t } from "$lib/translations";
  import InteractionsTable from "#/InteractionsTable.svelte";
  import { goto } from "$app/navigation";
  import { navigating } from "$app/state";
  import Circles from "#/Circles.svelte";

  let { data }: PageProps = $props();
  let inputHandle: string = $state(data.handle ?? "");

  let mainProfile: SimpleProfileType | null = $state(null);
  let modifiedData: InteractionsDataType | null = $state(null);
  let groupedIds: string[][] = [];
  let fetchedData: Record<string, any> = {};
  let toggleGroupData: boolean = $state(false);

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

  $effect(() => {
    if (data.success && data.interactions && data.did) {
      modifiedData = JSON.parse(JSON.stringify(data.interactions));

      const allIds = new Set<string>();
      data.interactions.sent.forEach((item) => allIds.add(item._id));
      data.interactions.rcvd.forEach((item) => allIds.add(item._id));
      const uniqueIds = Array.from(allIds);
      uniqueIds.push(data.did);

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
          if (data.did && data.handle) {
            mainProfile = {
              did: data.did,
              handle: data.handle,
              display_name: fetchedData[data.did].display_name,
              avatar: fetchedData[data.did].avatar,
            };
          }
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

  $effect(() => {
    if (modifiedData) {
      let both = modifiedData.sent.concat(modifiedData.rcvd);
      const summed: { [key: string]: InteractionsType } = {};
      both.forEach((x) => {
        if (x._id in summed) {
          summed[x._id].c += x.c;
          summed[x._id].p += x.p;
          summed[x._id].l += x.l;
          summed[x._id].r += x.r;
          summed[x._id].t += x.t;
        } else {
          summed[x._id] = {
            _id: x._id,
            profile: x.profile,
            c: x.c,
            p: x.p,
            l: x.l,
            r: x.r,
            t: x.t,
          };
        }
      });
      modifiedData.both = Object.values(summed).sort((a, b) => {
        return (b.t as number) - (a.t as number);
      });
    }
  });

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (inputHandle && inputHandle.length > 0) {
      goto(`/i/${inputHandle.trim().replace(/^@/, "")}`, { invalidateAll: true });
    }
  }

  let actorsTypeahead: { did: string; handle: string; display_name: string }[] = $state([]);
  async function handleInputTypeahead(event: Event & { currentTarget: EventTarget & HTMLInputElement }) {
    event.preventDefault();

    const url = new URL("https://public.api.bsky.app/xrpc/app.bsky.actor.searchActorsTypeahead");
    url.searchParams.append("q", event.currentTarget.value);
    url.searchParams.append("limit", "10");

    try {
      const response = await fetch(url.toString());

      if (response.ok) {
        const { actors } = await response.json();
        actorsTypeahead = actors.map((x: Record<string, string>) => ({
          did: x.did,
          handle: x.handle,
          display_name: x.displayName,
        }));
      }
    } catch (error) {
      console.log(error);
    }
  }
</script>

<svelte:head>
  <title>Wolfgang - {$t("stuff.layout.navbar.interactions")}</title>
</svelte:head>

<div class="p-2 flex flex-col items-center border rounded-md w-full">
  <p class="pb-2 text-xl font-bold">{$t("stuff.interactions.title")}</p>
  <form onsubmit={handleSubmit}>
    <div class="join">
      <input
        class="input input-primary join-item"
        type="text"
        name="handle"
        placeholder={$t("stuff.common.handle")}
        list="actors"
        bind:value={inputHandle}
        oninput={handleInputTypeahead}
      />
      <button class="btn btn-primary join-item">{$t("stuff.common.search")}</button>
    </div>
  </form>
  <datalist id="actors">
    {#each actorsTypeahead as actor}
      <option value={actor.handle}>{actor.display_name}</option>
    {/each}
  </datalist>

  {#if showLoading}
    <p class="pt-2">{$t("stuff.interactions.loading")}</p>
    <p class="pt-2">{$t("stuff.interactions.loadingMsg")}</p>
    <span class="loading loading-infinity loading-lg"></span>
  {/if}
  {#if data.success && modifiedData && mainProfile}
    <p class="pt-2 font-bold text-lg">@{data.handle}</p>
    <p class="font-bold text-lg">{$t("stuff.interactions.dates.week")}</p>

    <details class="collapse bg-base-200 max-w-xl">
      <summary class="collapse-title text-xl text-center font-medium text-secondary bg-primary">
        {$t("stuff.interactions.bolas.title")}
      </summary>
      <div class="collapse-content">
        <Circles data={modifiedData} profile={mainProfile} />
      </div>
    </details>

    <div class="flex justify-center items-center py-3">
      <span class="label-text text-md pr-2">{$t("stuff.interactions.separate")}</span>
      <label class="relative inline-flex cursor-pointer items-center">
        <input id="switch" type="checkbox" class="peer sr-only" bind:checked={toggleGroupData} />
        <label for="switch" class="hidden"></label>
        <div
          class="peer h-6 w-11 rounded-full border bg-primary after:absolute after:left-[2px] after:top-0.5 after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-secondary peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:ring-green-300"
        ></div>
      </label>
      <span class="label-text text-md pl-2">{$t("stuff.interactions.consolidate")}</span>
    </div>
    {#if toggleGroupData}
      <div class="flex flex-col items-center">
        <p class="text-xl text-primary font-bold">{$t("stuff.interactions.table.both")}</p>
        <InteractionsTable data={modifiedData.both} perPage={10} />
      </div>
    {:else}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-1">
        <div class="flex flex-col items-center">
          <p class="text-xl text-primary font-bold">{$t("stuff.interactions.table.sent")}</p>
          <InteractionsTable data={modifiedData.sent} perPage={10} />
        </div>
        <div class="flex flex-col items-center">
          <p class="text-xl text-primary font-bold">{$t("stuff.interactions.table.rcvd")}</p>
          <InteractionsTable data={modifiedData.rcvd} perPage={10} />
        </div>
      </div>
    {/if}
  {:else}
    <p>{data.error}</p>
  {/if}
</div>
