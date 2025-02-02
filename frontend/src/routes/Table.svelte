<script lang="ts">
    import type { InteractionsType } from '$lib/types'
    import { t } from '$lib/translations';
    import Pagination from './Pagination.svelte';
    import UserRow from './UserRow.svelte';

    interface Props {
        data: InteractionsType[] | undefined;
        perPage: number;
    }

    let { data, perPage = 15 }: Props = $props();
    let paginatedData: Array<any> = $state([]);

</script>

<Pagination rows={data ?? []} {perPage} bind:trimmedRows={paginatedData} />
<div class="overflow-x-auto">
    <table class="table table-xs table-zebra">
        <thead>
            <tr class="text-center text-lg text-primary">
                <th>#</th>
                <th title={$t('features.common.user')}>{$t('features.common.user')}</th>
                <th title={$t('features.common.characters')}><i class="bi bi-hash"></i></th>
                <th title={$t('features.common.replies')}
                    ><i class="bi bi-chat-square-text-fill"></i></th
                >
                <th title={$t('features.common.likes')}><i class="bi bi-repeat"></i></th>
                <th title={$t('features.common.reposts')}><i class="bi bi-heart-fill"></i></th>
                <th title={$t('features.common.total')}>{$t('features.common.total')}</th>
            </tr>
        </thead>
        <tbody>
            {#each paginatedData as row (row._id)}
                <tr class="text-center">
                    <td>{row.idx}</td>
                    <td class="text-left">
                        <UserRow did={row._id} profile={row} blocked={row.blocked} />
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
