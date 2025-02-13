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
                <th title={$t('stuff.common.user')}>{$t('stuff.common.user')}</th>
                <th title={$t('stuff.common.characters')}><i class="bi bi-hash"></i></th>
                <th title={$t('stuff.common.replies')}
                    ><i class="bi bi-chat-square-text-fill"></i></th
                >
                <th title={$t('stuff.common.likes')}><i class="bi bi-repeat"></i></th>
                <th title={$t('stuff.common.reposts')}><i class="bi bi-heart-fill"></i></th>
                <th title={$t('stuff.common.total')}>{$t('stuff.common.total')}</th>
            </tr>
        </thead>
        <tbody>
            {#each paginatedData as row, idx (row._id)}
                <tr class="text-center">
                    <td>{idx+1}</td>
                    <td class="text-left">
                        <UserRow did={row._id} profile={row.profile} />
                    </td>
                    <td>{row.l}</td>
                    <td>{row.r}</td>
                    <td>{row.p}</td>
                    <td>{row.c}</td>
                    <td>{row.t}</td>
                </tr>
            {/each}
        </tbody>
    </table>
</div>
