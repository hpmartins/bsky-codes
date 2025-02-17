<script lang="ts">
    import type { CirclesOptionsType, InteractionsDataType, SimpleProfileType } from "$lib/types";
    import { t } from "$lib/translations";
    import CirclesImage from "./CirclesImage.svelte";

    let options: CirclesOptionsType = $state({
        orbits: 2,
        include_sent: true,
        include_rcvd: false,
        add_watermark: true,
        add_date: true,
        bg_color: "#1D428A",
        add_border: true,
        border_color: "#FFC72C",
    });

    interface Props {
        profile: SimpleProfileType; // user profile (handle, displayName, avatar)
        data: InteractionsDataType; // data.sent, data.rcvd, data.both (interactions)
    }
    let { data, profile }: Props = $props();
</script>

<div class="flex flex-col items-center gap-2 p-2">
    <div class="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-4 border-4 p-2 border-secondary rounded">
        <div class="flex flex-col gap-2">
            <p class="font-medium">{$t("stuff.interactions.bolas.include")}:</p>
            <label class="label cursor-pointer gap-x-3 justify-start">
                <input
                    class="checkbox checkbox-sm checkbox-secondary"
                    type="checkbox"
                    bind:checked={options.include_sent}
                />
                <span class="label-text">{$t("stuff.interactions.bolas.sent")}</span>
            </label>
            <label class="label cursor-pointer gap-x-3 justify-start">
                <input
                    class="checkbox checkbox-sm checkbox-secondary"
                    type="checkbox"
                    bind:checked={options.include_rcvd}
                />
                <span class="label-text">{$t("stuff.interactions.bolas.received")}</span>
            </label>
        </div>

        <div class="flex flex-col gap-2">
            <p class="font-medium">{$t("stuff.interactions.bolas.options")}:</p>
            <label class="label cursor-pointer gap-x-3 justify-start">
                <input
                    class="checkbox checkbox-sm checkbox-secondary"
                    type="checkbox"
                    bind:checked={options.add_date}
                />
                <span class="label-text">{$t("stuff.interactions.bolas.add_date")}</span>
            </label>
            <label class="label cursor-pointer gap-x-3 justify-start">
                <input
                    class="checkbox checkbox-sm checkbox-secondary"
                    type="checkbox"
                    bind:checked={options.add_watermark}
                />
                <span class="label-text">{$t("stuff.interactions.bolas.add_watermark")}</span>
            </label>
        </div>
        <div class="flex flex-col gap-2">
            <div class="flex items-center space-x-2">
                <p class="font-medium">{$t("stuff.interactions.bolas.bg_color")}:</p>
                <input type="color" class="w-full" bind:value={options.bg_color} />
            </div>

            <div class="flex items-center space-x-2">
                <input
                    class="checkbox checkbox-sm checkbox-secondary"
                    type="checkbox"
                    bind:checked={options.add_border}
                />
                <p class="font-medium">{$t("stuff.interactions.bolas.border_color")}:</p>
                <input type="color" class="w-full" bind:value={options.border_color} />
            </div>
        </div>

        <div class="flex flex-col gap-2">
            <p class="font-medium">{$t("stuff.interactions.bolas.orbits")}:</p>
            <input
                type="range"
                class="range range-xs range-primary w-full"
                min="1"
                max="3"
                bind:value={options.orbits}
            />
        </div>
    </div>

    <CirclesImage {data} {profile} {options} />
</div>
