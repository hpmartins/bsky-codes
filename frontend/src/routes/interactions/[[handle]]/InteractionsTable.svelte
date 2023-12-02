<script lang="ts">
    import type { InteractionsType } from '@common/types';
    import { t } from '$lib/translations';
    import Pagination from '#/Pagination.svelte';
    import UserRow from '#/UserRow.svelte';

    export let data: InteractionsType[] | undefined;
    export let perPage: number = 15;

    let paginatedData: Array<any> = [];
</script>

<Pagination rows={data ?? []} {perPage} bind:trimmedRows={paginatedData} />
<div class="overflow-x-auto">
    <table class="table table-xs table-zebra">
        <thead>
            <tr class="text-center text-lg text-primary">
                <th>#</th>
                <th title={$t('features.common.user')}>{$t('features.common.user')}</th>
                <th title={$t('features.common.characters')}><i class="bi bi-hash" /></th>
                <th title={$t('features.common.replies')}
                    ><i class="bi bi-chat-square-text-fill" /></th
                >
                <th title={$t('features.common.likes')}><i class="bi bi-repeat" /></th>
                <th title={$t('features.common.reposts')}><i class="bi bi-heart-fill" /></th>
                <th title={$t('features.common.total')}>{$t('features.common.total')}</th>
            </tr>
        </thead>
        <tbody>
            {#each paginatedData as row (row._id)}
                <tr class="text-center">
                    <td>{row.idx}</td>
                    <td class="text-left">
                        <UserRow did={row._id} profile={row.profile} />
                    </td>
                    <td>{row.characters}</td>
                    <td>{row.replies}</td>
                    <td>{row.reposts}</td>
                    <td>{row.likes}</td>
                    <td>{row.points}</td>
                </tr>
            {/each}
        </tbody>
    </table>
</div>
