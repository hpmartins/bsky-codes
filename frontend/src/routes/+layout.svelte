<script lang="ts">
  import '../app.postcss';
  import wolfgang from '$lib/assets/wolfgang.jpg';

  import dayjs from 'dayjs';
  import { t, locale } from '$lib/translations';
  import localizedFormat from 'dayjs/plugin/localizedFormat';
  import 'dayjs/locale/pt-br';
  import 'dayjs/locale/pt';
  dayjs.extend(localizedFormat);
  dayjs.locale(locale.get());

  const navbar = [
    {
      key: 'interactions',
      href: '/interactions',
      icon: 'people',
    },
    {
      key: 'blocks',
      href: '/blocks',
      icon: 'ban',
    },
    {
      key: 'top_blocked',
      href: '/top/blocked',
      icon: 'x-circle',
    },
    {
      key: 'top_posters',
      href: '/top/posters',
      icon: 'graph-up-arrow',
    },
  ];
</script>

<svelte:head>
  <script src="https://ajax.googleapis.com/ajax/libs/jquery/3.7.1/jquery.min.js"></script>
  <link
    href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css"
    rel="stylesheet"
  />
  <title>Wolfgang</title>
</svelte:head>

<div class="flex flex-col h-screen">
  <div class="navbar bg-primary">
    <div class="navbar-start">
      <div class="dropdown">
        <label for="menuSvg" tabindex="-1" class="btn btn-ghost sm:hidden">
          <svg
            id="menuSvg"
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="#FFC72C"
            ><path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 6h16M4 12h8m-8 6h16"
            /></svg
          >
        </label>
        <ul
          tabindex="-1"
          class="menu menu-sm dropdown-content mt-3 z-[1] p-2 shadow bg-base-100 rounded-box w-52"
        >
          {#each navbar as item}
            <li>
              <a type="button" href={item.href}>
                <i class="bi-{item.icon}" />
                {$t(`layout.navbar.${item.key}`)}
              </a>
            </li>
          {/each}
        </ul>
      </div>
      <a href="/" class="btn btn-primary text-secondary normal-case text-xl">
        <img src={wolfgang} alt="Logo" width="32" height="32" style="border-radius: 33%;" />
        Wolfgang
      </a>
    </div>
    <div class="navbar-center hidden sm:flex">
      {#each navbar as item}
        <a class="btn btn-primary btn-sm text-secondary normal-case content-center" href={item.href}>
          <i class="bi-{item.icon}" />
          {$t(`layout.navbar.${item.key}`)}
        </a>
      {/each}
    </div>
    <div class="navbar-end">
      <a
        href="https://ko-fi.com/X8X3QCC8X"
        target="_blank"
        class="btn btn-sm normal-case btn-primary text-secondary">{$t('layout.support')}</a
      >
    </div>
  </div>

  <div>
    <slot />
  </div>

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
        {$t('layout.built')} | <a class="link" href="/contact">{$t('layout.contact')}</a>
      </p>
    </aside>
  </footer>
</div>
