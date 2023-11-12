<script>
  export let rows;
  export let perPage;
  export let trimmedRows;

  $: totalRows = rows.length;
  $: currentPage = 0;
  $: totalPages = Math.ceil(totalRows / perPage);
  $: start = currentPage * perPage;
  $: end = currentPage === totalPages - 1 ? totalRows - 1 : start + perPage - 1;

  $: trimmedRows = rows.slice(start, end + 1);

  $: totalRows, (currentPage = 0);
  $: currentPage, start, end;
</script>

{#if totalRows && totalRows > perPage}
  <div class="flex justify-center">
    <div class="join">
      <button
        class="btn btn-sm btn-primary text-secondary disabled:text-gray disabled:btn-primary join-item"
        on:click={() => (currentPage -= 1)}
        disabled={currentPage === 0 ? true : false}
        aria-label="left arrow icon"
        aria-describedby="prev"
      >
        <i class="bi bi-chevron-double-left" />
      </button>
      <div class="btn btn-sm btn-primary text-secondary join-item">{start + 1} - {end + 1} of {totalRows}</div>

      <button
        class="btn btn-sm btn-primary text-secondary disabled:text-gray disabled:btn-primary join-item"
        on:click={() => (currentPage += 1)}
        disabled={currentPage === totalPages - 1 ? true : false}
        aria-label="right arrow icon"
        aria-describedby="next"
      >
        <i class="bi bi-chevron-double-right" />
      </button>
    </div>
  </div>
{/if}
