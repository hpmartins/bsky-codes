<script lang="ts">
    import { t } from "$lib/translations";

    const link = "https://bsky.app/";

    let { data } = $props();
    const { collStats, locale } = data;

    import Number from "#/Number.svelte";
</script>

<p>{@html $t("stuff.homepage.headline", { link })}</p>

<!-- <div class="stats stats-vertical text-primary shadow">
    {#each Object.entries(collStats) as [coll, count]}
        <div class="stat">
            <div class="stat-title">{coll}</div>
            <div class="stat-value"><Number number={count} {locale}/></div>
        </div>
    {/each}
</div> -->
