<script lang="ts">
  let { children } = $props();
  import "../app.css";

  import { t, locale } from "$lib/translations";
</script>

<svelte:head>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css" rel="stylesheet" />
  <title>Wolfgang</title>
</svelte:head>

<header class="mt-2">
  <div class="grid gap-y-2 justify-items-center">
    <h1 class="text-2xl text-primary">{$t("stuff.homepage.title")}</h1>

    <div class="logo w-25 h-40 rounded-xl overflow-hidden">
      <img src="/logo.jpg" alt="Logo" class="w-full h-full object-cover" />
    </div>

    <div>
      <a href="/" role="button" class="btn btn-sm btn-primary">home</a>
    </div>
  </div>
</header>

<main class="container mx-auto px-2 py-2">
  {@render children()}
</main>

<!-- <footer class="footer footer-center p-4 mt-auto text-base-content">
    <aside>
      <a href="https://ko-fi.com/X8X3QCC8X" target="_blank">
        <img
          style="height:45px;"
          src="https://storage.ko-fi.com/cdn/kofi2.png?v=3"
          alt="Buy Me a Coffee at ko-fi.com"
        />
      </a>
      <p>
        {$t("layout.built")}
      </p>
    </aside>
  </footer> -->
