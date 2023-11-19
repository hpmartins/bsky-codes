<script lang="ts">
  import type { PageServerData } from './$types';

  export let data: PageServerData;
</script>

<div class="md:container md:mx-auto center p-12 space-y-8">
  <p class="text-xl font-bold">Welcome to Wolfgang!</p>
  <p>
    Information about <a class="link" href="https://bsky.app/">Bluesky</a> accounts. Not all data is indexed yet.
  </p>

  <div class="flex justify-center">
    <div class="stats stats-vertical md:stats-horizontal shadow">
      <div class="stat">
        <div class="stat-title">Profiles</div>
        <div class="stat-value">{data.count.profiles}</div>
      </div>
      <div class="stat">
        <div class="stat-title">Posts</div>
        <div class="stat-value">{data.count.posts}</div>
      </div>
      <div class="stat">
        <div class="stat-title">Blocks</div>
        <div class="stat-value">{data.count.blocks}</div>
      </div>
      <div class="stat">
        <div class="stat-title">Interactions</div>
        <div class="stat-value">{data.count.interactions}</div>
      </div>
    </div>
  </div>

  <div class="flex flex-row flex-grow flex-wrap justify-center gap-4">
    <div class="card w-full md:w-80 bg-primary text-secondary">
      <a href="/interactions">
        <div class="card-body p-3">
          <h2 class="card-title">Interactions</h2>
          <p>Find your interactions by week and create an image with the top profiles</p>
        </div>
      </a>
    </div>
    <div class="card w-full md:w-80 bg-primary text-secondary">
      <a href="/blocks">
        <div class="card-body p-3">
          <h2 class="card-title">Blocks</h2>
          <p>Search who anyone blocks or is blocked by</p>
        </div>
      </a>
    </div>
    <div class="card w-full md:w-80 bg-primary text-secondary">
      <a href="/top/blocked">
        <div class="card-body p-3">
          <h2 class="card-title">Top blocked</h2>
          <p>Most blocked accounts in the last 72 hours</p>
        </div>
      </a>
    </div>
    <div class="card w-full md:w-80 bg-primary text-secondary">
      <a href="/top/posters">
        <div class="card-body p-3">
          <h2 class="card-title">Top posters</h2>
          <p>Who most posted in the last 72 hours</p>
        </div>
      </a>
    </div>
  </div>
</div>
