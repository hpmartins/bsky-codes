<script lang="ts">
  import "../app.css";
  import { t, locale } from "$lib/translations";
  import wolfgang from '$lib/assets/logo.jpg?enhanced';

  let { children } = $props();
</script>

<svelte:head>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css" rel="stylesheet" />
  <title>Wolfgang</title>
</svelte:head>
<div class="flex flex-col min-h-screen">
  <header class="pt-4">
    <div class="grid justify-items-center">
      <div class="flex flex-col items-center gap-y-2">
        <a href="/"><h1 class="text-2xl text-primary">{$t("stuff.homepage.title")}</h1></a>
        <a href="/" aria-label="Index">
          <div class="logo w-25 h-40 rounded-xl overflow-hidden">
            <enhanced:img src={wolfgang} alt="Logo" class="w-full h-full object-cover" />
          </div>
        </a>
      </div>
      <div class="pt-2">
        <a href="/top/interactions" role="button" class="btn btn-sm btn-primary"
          >{$t("stuff.layout.navbar.top_interactions")}</a
        >
        <a href="/top/blocks" role="button" class="btn btn-sm btn-primary">{$t("stuff.layout.navbar.top_blocks")}</a>
        <a href="/i" role="button" class="btn btn-sm btn-primary">{$t("stuff.layout.navbar.interactions")}</a>
      </div>
    </div>
  </header>

  <main class="flex justify-center mx-auto p-2 max-w-6xl">
    {@render children()}
  </main>

  <footer class="footer footer-center p-4 mt-auto text-base-content">
    <aside>
      <a href="https://ko-fi.com/X8X3QCC8X" target="_blank">
        <img
          style="height:45px;"
          src="https://storage.ko-fi.com/cdn/kofi2.png?v=3"
          alt="Buy Me a Coffee at ko-fi.com"
        />
      </a>
      <p>
        {$t("stuff.layout.built")}
      </p>
    </aside>
  </footer>
</div>
