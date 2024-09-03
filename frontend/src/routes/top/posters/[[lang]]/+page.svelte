<script lang="ts">
    import type { PageServerData } from './$types';
    import { t } from '$lib/translations';
    import Pagination from '#/Pagination.svelte';
    import UserRow from '#/UserRow.svelte';
    import { goto } from '$app/navigation';

    export let data: PageServerData;
    let paginatedData: any[] = [];
    let selectedLanguage = 'all';

    if (data.lang) {
        selectedLanguage = data.lang;
    }

    const onSelectLanguage = async () => {
        goto(`/top/posters/${selectedLanguage}`);
    };

    let removeBots = true;
    $: list = removeBots
        ? data.posters
              ?.filter((x) => (x.likes + x.replies)/x.count >= 0.1)
              .map((x, idx) => ({ ...x, idx: idx + 1 }))
        : data.posters;
</script>

<div class="text-center">
    <div class="text-2xl">{$t('features.top.posters.title')}</div>
</div>
<div class="flex flex-col md:flex-row max-w-4xl items-center gap-4">
    {#if data.langs}
        <div class="flex items-center">
            Filter by language:
            <select
                class="select select-primary w-full max-w-xs"
                bind:value={selectedLanguage}
                on:change={onSelectLanguage}
            >
                <option value="all" selected={selectedLanguage === 'all'}
                    >{$t('features.languages.selectPlaceholder')}</option
                >
                {#each data.langs as lang}
                    <option value={lang._id ?? 'none'} selected={selectedLanguage === lang._id}
                        >{`${lang._id ?? 'none'}: ${lang.count}`}</option
                    >
                {/each}
            </select>
        </div>
    {/if}
    <div class="flex items-center">
        <label class="relative inline-flex cursor-pointer items-center">
            <input id="switch" type="checkbox" class="peer sr-only" bind:checked={removeBots} />
            <label for="switch" class="hidden" />
            <div
                class="peer h-6 w-11 rounded-full border bg-primary after:absolute after:left-[2px] after:top-0.5 after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-secondary peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:ring-green-300"
            />
        </label>
        <span class="label-text text-md pl-2">{$t('features.top.posters.toggle')}</span>
    </div>
</div>

<Pagination rows={list ?? []} perPage={60} bind:trimmedRows={paginatedData} />
<div class="overflow-x-auto w-full md:max-w-4xl">
    <table class="table table-xs table-zebra">
        <thead>
            <tr class="text-center text-lg text-primary">
                <th>#</th>
                <th title={$t('features.common.user')}>{$t('features.common.user')}</th>
                <th title={$t('features.common.count')}>{$t('features.common.count')}</th>
                <th title={$t('features.common.characters')}><i class="bi bi-hash" /></th>
                <th title={$t('features.common.replies')}
                    ><i class="bi bi-chat-square-text-fill" /></th
                >
                <th title={$t('features.common.reposts')}><i class="bi bi-repeat" /></th>
                <th title={$t('features.common.likes')}><i class="bi bi-heart-fill" /></th>
            </tr>
        </thead>
        <tbody>
            {#each paginatedData as row (row._id)}
                <tr class="text-center">
                    <td>{row.idx}</td>
                    <td class="text-left">
                        <UserRow did={row._id} profile={row.profile} />
                    </td>
                    <td>{row.count}</td>
                    <td>{row.characters}</td>
                    <td>{row.replies}</td>
                    <td>{row.reposts}</td>
                    <td>{row.likes}</td>
                </tr>
            {/each}
        </tbody>
    </table>
</div>
