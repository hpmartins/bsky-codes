<script lang="ts">
    import type { PageServerData } from './$types';
    import dayjs from 'dayjs';
    import { t } from '$lib/translations';
    import Pagination from '#/Pagination.svelte';
    import UserRow from '#/UserRow.svelte';

    export let data: PageServerData;
    let paginatedData: any[] = [];

    const date = dayjs(data?.date).format('L LT');
</script>

<div class="text-center">
    <div class="text-2xl">{$t('features.top.blocked.title')}</div>
    <div class="text-md">{$t('features.common.last_updated', { date })}</div>
</div>

{#if data.found}
    <Pagination rows={data?.list ?? []} perPage={20} bind:trimmedRows={paginatedData} />
    <div class="overflow-x-auto w-full md:max-w-2xl">
        <table class="table table-xs table-zebra">
            <thead>
                <tr class="text-center text-lg text-primary">
                    <th>#</th>
                    <th title={$t('features.common.user')}>{$t('features.common.user')}</th>
                    <th title={$t('features.common.count')}>{$t('features.common.count')}</th>
                </tr>
            </thead>
            <tbody>
                {#each paginatedData as row (row._id)}
                    <tr class="text-center">
                        <td>{row.idx}</td>
                        <td class="text-left">
                            <UserRow did={row._id} profile={row.profile} />
                        </td>
                        <td>{row.count}</td>
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>
{:else}
    Error: data not found.
{/if}
