<script lang="ts">
  import { t } from '$lib/translations';
  import type { PageServerData } from './$types';

  export let data: PageServerData;

  const link = 'https://bsky.app/';

  const stats = [
    {
      key: 'profiles',
      count: data.count.profiles,
    },
    {
      key: 'posts',
      count: data.count.posts,
    },
    {
      key: 'blocks',
      count: data.count.blocks,
    },
    {
      key: 'interactions',
      count: data.count.interactions,
    },
  ];

  const cards = [
    {
      key: 'interactions',
      href: '/interactions',
    },
    {
      key: 'blocks',
      href: '/top_blocks',
    },
    {
      key: 'top_blocked',
      href: '/top/blocked',
    },
    {
      key: 'top_posters',
      href: '/top/posters',
    },
  ];
</script>

<div class="md:container md:mx-auto center p-12 space-y-8">
  <p class="text-xl font-bold">{$t('home.title')}</p>
  <p>
    {@html $t('home.headline', { link })}
  </p>

  <div class="flex justify-center">
    <div class="stats stats-vertical md:stats-horizontal shadow">
      {#each stats as stat}
        <div class="stat">
          <div class="stat-title">{$t(`home.stats.${stat.key}`)}</div>
          <div class="stat-value">{stat.count}</div>
        </div>
      {/each}
    </div>
  </div>

  <div class="flex flex-row flex-grow flex-wrap justify-center gap-4">
    {#each cards as card}
      <div class="card w-full md:w-80 bg-primary text-secondary">
        <a href={card.href}>
          <div class="card-body p-3">
            <h2 class="card-title">{$t(`home.cards.${card.key}.title`)}</h2>
            <p>{$t(`home.cards.${card.key}.text`)}</p>
          </div>
        </a>
      </div>
    {/each}
  </div>
</div>
