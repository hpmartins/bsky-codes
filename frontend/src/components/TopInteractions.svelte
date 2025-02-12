<script lang="ts">
    import type { TopInteractionsResponse } from "$lib/types";
    import dayjs from "dayjs";
    import { t } from "$lib/translations";
    import UserRow from "#/UserRow.svelte";

    let { src }: { src: TopInteractionsResponse } = $props();

    const RECORDS = ["like", "repost", "post"];
    const NAMES = ["subject", "author"];

    const BADGES: Record<string, string> = {
        like: "bi-heart-fill",
        repost: "bi-repeat",
        post: "bi-chat-square-text-fill",
    };

    const { data } = src;
    const date = dayjs(src._id).format();
</script>

{#each NAMES as subkey}
    <p class="pt-2 text-xl text-primary">{$t(`stuff.top.${subkey}Desc`)}</p>
    <p>{date}</p>
    <div class="flex flex-row py-3">
        {#each RECORDS as key}
            {@const tdata = data.filter(x => (x.key == key) && (x.subkey == subkey))[0]}
            <div class="flex flex-col items-center px-3">
                <div class="badge badge-secondary">
                    <i class="bi {BADGES[key]}"></i>
                    {$t(`stuff.top.${key}`)}
                </div>
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
                            {#each tdata.items as row, idx (row._id)}
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
