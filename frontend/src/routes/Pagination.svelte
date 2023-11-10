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
  <div class="pagination">
    <div class="btn-group btn-group-sm" role="group" aria-label="Basic outlined example">
    <button
      class="btn btn-link"
      on:click={() => (currentPage -= 1)}
      disabled={currentPage === 0 ? true : false}
      aria-label="left arrow icon"
      aria-describedby="prev"
    >
      <i class="bi bi-chevron-double-left"></i>
    </button>

    <div style="margin: 0 1rem;" class="btn">{start + 1} - {end + 1} of {totalRows}</div>

    <button
    class="btn btn-link"
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

<style>
  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: all;
  }

  button {
    display: flex;
  }
</style>
