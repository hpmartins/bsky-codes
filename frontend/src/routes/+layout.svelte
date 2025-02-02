<script>
	let { children } = $props();
	import "../app.css";
</script>

<svelte:head>
    <link
        href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css"
        rel="stylesheet"
    />
    <title>Wolfgang</title>
</svelte:head>

{@render children()}
