<script lang="ts">
  import '../app.postcss';
  import Navbar from './Navbar.svelte';
  import type { LayoutData } from './$types';

  export let data: LayoutData;
</script>

<div class="container">
  <Navbar items={data.navbar} />
  <slot />
</div>

<svelte:head>
  <script src="https://ajax.googleapis.com/ajax/libs/jquery/3.7.1/jquery.min.js"></script>
  <link href="https://fonts.googleapis.com/css?family=Noto Sans" rel="stylesheet" />
  <link
    href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css"
    rel="stylesheet"
  />
  <script
    src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"
    integrity="sha384-C6RzsynM9kWDrMNeT87bh95OGNyZPhcTNXj1NW7RuBCsyN/o0jlpcV8Qyq46cDfL"
    crossorigin="anonymous"
  ></script>
  <title>Wolfgang</title>
</svelte:head>

<footer class="mt-auto">
  <a href="https://ko-fi.com/X8X3QCC8X" target="_blank">
    <img
      style="height:50px;"
      src="https://storage.ko-fi.com/cdn/kofi2.png?v=3"
      alt="Buy Me a Coffee at ko-fi.com"
    />
  </a>
  <p>
    built by henrique | <a href="/contact">contact</a>
  </p>
</footer>

<style>
  footer {
    height: 110px;
    line-height: 45px;
    text-align: center;
  }
</style>
