<script lang="ts">
    let { data }: { data: any } = $props();

    import dayjs from "dayjs";
    import { t } from "$lib/translations";
    import UserRow from "#/UserRow.svelte";

    const RECORDS = ["like", "repost", "post"];
    const NAMES = ["subject", "author"];

    const BADGES: Record<string, string> = {
        like: "bi-heart-fill",
        repost: "bi-repeat",
        post: "bi-chat-square-text-fill",
    };
</script>

{#each NAMES as name}
    {@const items = data[name]["data"]}
    {@const date = dayjs(data[name]["_id"]).format()}
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
