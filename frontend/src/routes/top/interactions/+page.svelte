<script lang="ts">
    import type { PageProps } from "./$types";
    import type { TopInteractionsResponse } from "$lib/types";
    import { DateTime } from "luxon";
    import { t, locale } from "$lib/translations";
    import UserRow from "#/UserRow.svelte";
    import Pagination from "#/Pagination.svelte";

    let { data }: PageProps = $props();

    const RECORDS = ["like", "repost", "post"];
    const NAMES = ["subject", "author"];

    const BADGES: Record<string, string> = {
        like: "bi-heart-fill",
        repost: "bi-repeat",
        post: "bi-chat-square-text-fill",
    };

    let { _id, data: intData } = data.top_interactions as TopInteractionsResponse;
    let date: string = DateTime.fromISO(_id).setLocale(locale.get()).toLocaleString(DateTime.DATETIME_SHORT);
    let paginatedData: Record<string, Record<string, Array<any>>> = $state({});

    RECORDS.forEach((key) => {
        paginatedData[key] = {};
    });
</script>

<svelte:head>
    <title>Wolfgang - {$t("stuff.layout.navbar.top_interactions")}</title>
</svelte:head>

<div class="border rounded-md">
    <p class="text-md text-primary text-center">{$t("stuff.top.updateDesc")}</p>
    <p class="text-center">{$t("stuff.common.last_updated", { date })}</p>
    <hr />
    {#if intData}
        {#each NAMES as subkey}
            <p class="pt-2 text-xl text-primary text-center">{$t(`stuff.top.${subkey}Desc`)}</p>
            <div class="p-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {#each RECORDS as key}
                    {@const tdata = intData.filter((x) => x.key == key && x.subkey == subkey)[0].items}

                    <div class="flex flex-col items-center">
                        <div class="text-primary text-xl">
                            <i class="bi {BADGES[key]}"></i>
                            {$t(`stuff.top.${key}`)}
                        </div>
                        <Pagination rows={tdata ?? []} perPage={20} bind:trimmedRows={paginatedData[key][subkey]} />
                        <div class="overflow-x-auto w-full md:max-w-2xl">
                            <table class="table table-xs table-zebra">
                                <thead>
                                    <tr class="text-center text-primary">
                                        <th>#</th>
                                        <th>{$t("stuff.common.user")}</th>
                                        <th>{$t("stuff.common.count")}</th>
                                        {#if key == "post"}
                                            <th>#s</th>
                                        {/if}
                                    </tr>
                                </thead>
                                <tbody>
                                    {#each paginatedData[key][subkey] as row, idx (row._id)}
                                        <tr class="text-center">
                                            <td>{idx + 1}</td>
                                            <td class="text-left">
                                                <UserRow did={row._id} profile={row.profile} />
                                            </td>
                                            <td>{row.count}</td>
                                            {#if key == "post"}
                                                <td>{row.c}</td>
                                            {/if}
                                        </tr>
                                    {/each}
                                </tbody>
                            </table>
                        </div>
                    </div>
                {/each}
            </div>
            <hr />
        {/each}
    {/if}
</div>
