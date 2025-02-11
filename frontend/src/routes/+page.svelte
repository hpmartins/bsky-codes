<script lang="ts">
    let { data }: { data: { top_interactions: any; top_blocks: any } } = $props();

    import dayjs from "dayjs";
    import { t } from "$lib/translations";
    import UserRow from "#/UserRow.svelte";

    const RECORDS = ["like", "repost", "post"];
    const NAMES = ["author", "subject"];

    const BADGES: Record<string, string> = {
        like: "bi-heart-fill",
        repost: "bi-repeat",
        post: "bi-chat-square-text-fill",
    };
</script>

<p class="text-md text-primary">{$t("stuff.top.updateDesc")}</p>
<hr />
{#if data.top_interactions}
    {#each NAMES as name}
        <p class="pt-2 text-xl text-primary">{$t(`stuff.top.${name}Desc`)}</p>
        <div class="flex flex-row py-3">
            {#each RECORDS as record}
                {@const items = data.top_interactions[name][record]["data"]}
                {@const date = dayjs(data.top_interactions[name][record]["_id"]).format()}
                <div class="flex flex-col items-center px-3">
                    <div class="badge badge badge-secondary">
                        <i class="bi {BADGES[record]}"></i>
                        {$t(`stuff.top.${record}`)}
                    </div>
                    <div class="overflow-x-auto w-full md:max-w-2xl">
                        <table class="table table-xs table-zebra">
                            <thead>
                                <tr class="text-center text-primary">
                                    <th>#</th>
                                    <th>{$t("stuff.common.user")}</th>
                                    <th>{$t("stuff.common.count")}</th>
                                    {#if record == "post"}
                                        <th>#s</th>
                                    {/if}
                                </tr>
                            </thead>
                            <tbody>
                                {#each items as row, idx (row._id)}
                                    <tr class="text-center">
                                        <td>{idx + 1}</td>
                                        <td class="text-left">
                                            <UserRow did={row._id} profile={row.profile} />
                                        </td>
                                        <td>{row.count}</td>
                                        {#if record == "post"}
                                            <td>{row.c}</td>
                                        {/if}
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                    <p>{date}</p>
                </div>
            {/each}
        </div>
        <hr />
    {/each}
{/if}

{#if data.top_blocks}
    <p class="pt-5 text-xl text-primary">blocks</p>
    <div class="flex flex-row justify-center py-3">
        {#each NAMES as name}
            {@const items = data.top_blocks[name]["data"]}
            {@const date = dayjs(data.top_blocks[name]["_id"]).format()}
            <div class="flex flex-col px-3">
                <p class="text-lg font-bold">{name}</p>
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
                            {#each items as row, idx (row._id)}
                                <tr class="text-center">
                                    <td>{idx + 1}</td>
                                    <td class="text-left">
                                        <UserRow did={row._id} profile={row.profile} />
                                    </td>
                                    <td>{row.count}</td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
                <p>{date}</p>
            </div>
        {/each}
    </div>
{/if}
