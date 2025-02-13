<script lang="ts">
    import { t } from '$lib/translations';
    export let rows: any[];
    export let perPage: number;
    export let trimmedRows: any[];

    $: totalRows = rows.length;
    $: currentPage = 0;
    $: totalPages = Math.ceil(totalRows / perPage);
    $: start = currentPage * perPage;
    $: end = currentPage === totalPages - 1 ? totalRows - 1 : start + perPage - 1;

    $: trimmedRows = rows.map((x, idx) => ({idx: idx, ...x})).slice(start, end + 1);

    $: totalRows, (currentPage = 0);
    $: currentPage, start, end;
</script>

{#if totalRows && totalRows > perPage}
    <div class="flex justify-center">
        <div class="join">
            <button
                class="btn btn-xs btn-primary text-secondary disabled:text-gray disabled:btn-primary join-item"
                on:click={() => (currentPage -= 1)}
                disabled={currentPage === 0 ? true : false}
                aria-label="left arrow icon"
                aria-describedby="prev"
            >
                <i class="bi bi-chevron-double-left"></i>
            </button>
            <div class="btn btn-xs btn-primary text-secondary join-item">
                {start + 1} - {end + 1}
                {$t('stuff.common.of')}
                {totalRows}
            </div>

            <button
                class="btn btn-xs btn-primary text-secondary disabled:text-gray disabled:btn-primary join-item"
                on:click={() => (currentPage += 1)}
                disabled={currentPage === totalPages - 1 ? true : false}
                aria-label="right arrow icon"
                aria-describedby="next"
            >
                <i class="bi bi-chevron-double-right"></i>
            </button>
        </div>
    </div>
{/if}
