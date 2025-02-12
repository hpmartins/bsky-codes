<script lang="ts">
    import type { TopBlocksResponse } from "$lib/types";
    import dayjs from "dayjs";
    import { t } from "$lib/translations";
    import UserRow from "#/UserRow.svelte";

    let { src }: { src: TopBlocksResponse } = $props();
    const NAMES = ["subject", "author"];
    const { data } = src;
    const date = dayjs(src._id).format();
</script>


<p class="pt-5 text-xl text-primary">blocks</p>
<p>{date}</p>
<div class="flex flex-row justify-center py-3">
    {#each NAMES as key}
        {@const tdata = data.filter((x) => x.key == key)[0]}
        <div class="flex flex-col px-3">
            <p class="text-lg font-bold">{key}</p>
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
                        {#each tdata.items as row, idx (row._id)}
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
        </div>
    {/each}
</div>
