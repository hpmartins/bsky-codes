<script lang="ts">
    import type { PageProps } from "./$types";
    import type { TopBlocksResponse } from "$lib/types";
    import { DateTime } from "luxon";
    import { t, locale } from "$lib/translations";
    import UserRow from "#/UserRow.svelte";
    import Pagination from "#/Pagination.svelte";

    let { data }: PageProps = $props();
    const NAMES = ["subject", "author"];

    let { _id, data: intData } = data.top_blocks as TopBlocksResponse;
    let date: string = DateTime.fromISO(_id).setLocale(locale.get()).toLocaleString(DateTime.DATETIME_SHORT);
    let paginatedData: Record<string, Array<any>> = $state({});
</script>

<svelte:head>
    <title>Wolfgang - {$t("stuff.layout.navbar.top_blocks")}</title>
</svelte:head>

<div class="border rounded-md">
    <p class="text-md text-primary text-center">{$t("stuff.top.updateDesc")}</p>
    <p class="text-center">{$t("stuff.common.last_updated", { date })}</p>
    <hr />
    {#if intData}
        <div class="p-2 grid grid-cols-1 md:grid-cols-2 gap-2">
            {#each NAMES as key}
                {@const tdata = intData.filter((x) => x.key == key)[0].items}
                <div class="flex flex-col px-3">
                    <p class="text-lg text-center font-bold">{key}</p>
                    <Pagination rows={tdata ?? []} perPage={20} bind:trimmedRows={paginatedData[key]} />
                    <div class="overflow-x-auto w-full md:max-w-2xl">
                        <table class="table table-xs table-zebra">
                            <thead>
                                <tr class="text-center text-primary">
                                    <th>#</th>
                                    <th>{$t("stuff.common.user")}</th>
                                    <th>{$t("stuff.common.count")}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {#each paginatedData[key] as row (row.idx)}
                                    <tr class="text-center">
                                        <td>{row.idx + 1}</td>
                                        <td class="text-left">
                                            <UserRow did={row._id} profile={row.profile} />
                                        </td>
                                        <td>{row.count}</td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>
