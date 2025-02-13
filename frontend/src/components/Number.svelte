<script lang="ts">
    let { number, locale } = $props();

	let formattedNumber = $derived(new Intl.NumberFormat(locale).format(number));
</script>

<style>
	span {
		font-variant-numeric: tabular-nums;
	}
</style>

<span>{formattedNumber}</span>