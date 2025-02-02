<script>
	import { t } from '$lib/translations';
	import Table from './Table.svelte';
    import Circles from './Circles.svelte';
    import { goto } from '$app/navigation';

	let { data } = $props();


    let inputValue;

    let { dates } = $derived(data);
    let selectedDate;
	let circlesDate;

    let consolidateData = false;

    let circlesOptions = {
        orbits: 2,
        include_sent: true,
        include_rcvd: true,
        remove_bots: true,
        remove_blocked: true,
        add_watermark: true,
        add_date: true,
        bg_color: '#1D428A',
        add_border: true,
        border_color: '#FFC72C',
    };
</script>

<div class="flex flex-col items-center mt-10 min-h-screen text-center">
	<div class="logo w-20 h-35 rounded-xl overflow-hidden mb-6">
		<img src="/logo.jpg" alt="Logo" class="w-full h-full object-cover" /> 
	</div>
	<h1 class="text-3xl mb-6">Wolfgang</h1>
	<form>
		<div class="join">
			<input class="input input-primary join-item" type="text" name="actor" placeholder="Enter handle or did" value={data.actor ?? ''} />
			<button class="btn btn-primary join-item" type="submit">Search</button>
		</div>
	</form>
	{#if data.interactions}
		<h2>Results for actor: {data.actor}</h2>

        <details class="collapse bg-base-200">
            <summary
                class="collapse-title text-xl text-center font-medium text-secondary bg-primary"
                >↠ {$t('features.interactions.bolas.title')} ↞</summary
            >
            <div class="collapse-content">
                <div class="flex flex-col justify-center items-center gap-4">
                    <div
                        class="grid grid-cols-1 md:grid-cols-3 gap-4 justify-center p-4 border-4 border-secondary rounded mt-3"
                    >
                        <div>
                            {$t('features.interactions.bolas.include')}:
                            <label class="label cursor-pointer gap-x-3 justify-start">
                                <input
                                    class="checkbox checkbox-sm checkbox-secondary"
                                    type="checkbox"
                                    bind:checked={circlesOptions.include_sent}
                                />
                                <span class="label-text"
                                    >{$t('features.interactions.bolas.sent')}</span
                                >
                            </label>
                            <label class="label cursor-pointer gap-x-3 justify-start">
                                <input
                                    class="checkbox checkbox-sm checkbox-secondary"
                                    type="checkbox"
                                    bind:checked={circlesOptions.include_rcvd}
                                />
                                <span class="label-text"
                                    >{$t('features.interactions.bolas.received')}</span
                                >
                            </label>
                        </div>
                        <div>
                            {$t('features.interactions.bolas.options')}:
                            <label class="label cursor-pointer gap-x-3 justify-start">
                                <input
                                    class="checkbox checkbox-sm checkbox-secondary"
                                    type="checkbox"
                                    bind:checked={circlesOptions.remove_bots}
                                />
                                <span class="label-text"
                                    >{$t('features.interactions.bolas.remove_bots')}</span
                                >
                            </label>
                            <label class="label cursor-pointer gap-x-3 justify-start">
                                <input
                                    class="checkbox checkbox-sm checkbox-secondary"
                                    type="checkbox"
                                    bind:checked={circlesOptions.remove_blocked}
                                />
                                <span class="label-text"
                                    >{$t('features.interactions.bolas.remove_blocked')}</span
                                >
                            </label>
                            <label class="label cursor-pointer gap-x-3 justify-start">
                                <input
                                    class="checkbox checkbox-sm checkbox-secondary"
                                    type="checkbox"
                                    bind:checked={circlesOptions.add_date}
                                />
                                <span class="label-text"
                                    >{$t('features.interactions.bolas.add_date')}</span
                                >
                            </label>
                            <label class="label cursor-pointer gap-x-3 justify-start">
                                <input
                                    class="checkbox checkbox-sm checkbox-secondary"
                                    type="checkbox"
                                    bind:checked={circlesOptions.add_watermark}
                                />
                                <span class="label-text"
                                    >{$t('features.interactions.bolas.add_watermark')}</span
                                >
                            </label>
                        </div>
                        <div>
                            <div>
                                {$t('features.interactions.bolas.orbits')}:
                                <input
                                    type="range"
                                    class="range range-xs range-primary"
                                    min="1"
                                    max="3"
                                    bind:value={circlesOptions.orbits}
                                />
                            </div>
                            <div>
                                {$t('features.interactions.bolas.bg_color')}:
                                <input
                                    type="color"
                                    style="width:100%;"
                                    bind:value={circlesOptions.bg_color}
                                />
                            </div>
                            <div>
                                <label class="flex items-center space-x-2">
                                    <input
                                        class="checkbox checkbox-sm checkbox-secondary"
                                        type="checkbox"
                                        bind:checked={circlesOptions.add_border}
                                    />
                                    <p>{$t('features.interactions.bolas.border_color')}:</p>
                                </label>
                                <input
                                    type="color"
                                    style="width:100%;"
                                    bind:value={circlesOptions.border_color}
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        {#key data.interactions}{#key circlesOptions}
                                <Circles
                                    profile={data.profile}
                                    data={data.interactions}
                                    date={circlesDate}
                                    options={circlesOptions}
                                />
                            {/key}{/key}
                    </div>
                </div>
            </div>
        </details>
	{:else if data.error}
		<p>Error: {data.error}</p>
	{:else if data.actor}
		<p>No results found for actor: {data.actor}</p>
	{/if}
</div>
