<script lang="ts">
    import type { InteractionsType, CirclesOptionsType, InteractionsDataType, SimpleProfileType } from "$lib/types";
    import { t, locale } from "$lib/translations";
    import { copy } from "svelte-copy";
    import { DateTime, Duration } from "luxon";

    interface Props {
        profile: SimpleProfileType; // user profile (handle, displayName, avatar)
        data: InteractionsDataType; // data.sent, data.rcvd, data.both (interactions)
        options: CirclesOptionsType; // all options
    }

    let canvas: HTMLCanvasElement;
    let context: CanvasRenderingContext2D | null;
    let circlesImage: HTMLImageElement;
    let peopleList: string[] = $state([]);

    let { profile, data, options }: Props = $props();

    function hex_is_light(color: string) {
        const hex = color.replace("#", "");
        const c_r = parseInt(hex.substring(0, 0 + 2), 16);
        const c_g = parseInt(hex.substring(2, 2 + 2), 16);
        const c_b = parseInt(hex.substring(4, 4 + 2), 16);
        const brightness = (c_r * 299 + c_g * 587 + c_b * 114) / 1000;
        return brightness > 155;
    }
    const toRad = (x: number) => x * (Math.PI / 180);

    const dateNow = DateTime.now().setLocale(locale.get());
    const textFrom = dateNow.minus(Duration.fromObject({ days: 7 })).toLocaleString(DateTime.DATE_SHORT);
    const textTo = dateNow.toLocaleString(DateTime.DATE_SHORT);
    // this runs every time the Circles component is remounted,
    // which happens every time any of the inputs change
    $effect(() => {
        context = canvas.getContext("2d");

        if (!context) return;
        if (!data || !options) return;

        // decides which interactions to use based on the options
        let interactionsList: InteractionsType[] | undefined;
        if (options.include_sent && options.include_rcvd) {
            interactionsList = data.both;
        } else if (options.include_sent) {
            interactionsList = data.sent;
        } else {
            // default is received
            interactionsList = data.rcvd;
        }

        // no image if no data
        if (!interactionsList || interactionsList.length === 0) return;

        // - radial distances for each number of orbits
        // - i chose this manually
        const distances: { [key: number]: number[] } = {
            1: [0, 210, 0, 0],
            2: [0, 158, 246, 0],
            3: [0, 120, 196, 260],
        };

        // radiuses for every orbit for each number of orbits
        const radiuses: { [key: number]: number[] } = {
            1: [125, 55, 0, 0],
            2: [95, 42, 32, 0],
            3: [75, 32, 28, 22],
        };

        // - main input for the image generation later
        // - each block is an orbit, 0-th orbit is the
        //   main profile image
        let config = [
            { distance: 0, count: 1, radius: radiuses[options.orbits][0], users: [profile] },
            {
                distance: distances[options.orbits][1],
                count: 10,
                radius: radiuses[options.orbits][1],
                users: interactionsList.slice(0, 10).map((x) => x.profile ?? { avatar: undefined, handle: undefined }),
            },
            {
                distance: distances[options.orbits][2],
                count: 20,
                radius: radiuses[options.orbits][2],
                users: interactionsList.slice(10, 30).map((x) => x.profile ?? { avatar: undefined, handle: undefined }),
            },
            {
                distance: distances[options.orbits][3],
                count: 30,
                radius: radiuses[options.orbits][3],
                users: interactionsList.slice(30, 60).map((x) => x.profile ?? { avatar: undefined, handle: undefined }),
            },
        ];
        config = config.slice(0, options.orbits + 1);

        const width = 600;
        const height = 600;
        const textColor = hex_is_light(options.bg_color) ? "#000000" : "#CCCCCC";

        context.fillStyle = options.bg_color;
        context.fillRect(0, 0, width, height);

        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "medium";

        // date on top left corner
        if (options.add_date) {
            context.font = "20px Arial";
            context.fillStyle = textColor;
            context.textAlign = "left";
            context.fillText(`${textFrom} - ${textTo}`, 12, 28);
        }

        // site watermark on top right corner
        if (options.add_watermark) {
            context.font = "20px Arial";
            context.fillStyle = textColor;
            context.textAlign = "right";
            context.fillText("wolfgang.raios.xyz", 588, 28);
        }

        // add rounded border
        if (options.add_border) {
            context.strokeStyle = options.border_color;
            context.lineWidth = 15;
            context.beginPath();
            context.roundRect(0, 0, width, height, 15);
            context.stroke();
        }

        const promises: Promise<unknown>[] = [];

        const drawImage = async (
            context: CanvasRenderingContext2D,
            img: HTMLImageElement,
            opt: { [key: string]: number },
        ) => {
            context.save();
            // this draws a circle centered at the image position
            context.beginPath();
            context.arc(opt.centerX, opt.centerY, opt.radius, 0, 2 * Math.PI, false);
            // then clips whatever is out
            context.clip();
            // this draws the img at some position with some radius
            context.drawImage(img, opt.centerX - opt.radius, opt.centerY - opt.radius, opt.radius * 2, opt.radius * 2);
            context.restore();
        };

        // this will create the image, load the avatar and return a promise
        const preload = (avatar: string | undefined, opt: { [key: string]: number }) =>
            new Promise((resolve, reject) => {
                const img = new Image();
                img.setAttribute("crossOrigin", "anonymous");
                if (avatar) {
                    img.src = "/api/proxy?" + new URLSearchParams({ src: avatar });
                } else {
                    img.src = "/person-fill.svg";
                }
                img.onload = async function () {
                    if (!context) return reject;
                    drawImage(context, img, opt);
                    resolve(img);
                };
                img.onerror = async function () {
                    if (!context) return reject;
                    img.src = "/person-fill.svg";
                    drawImage(context, img, opt);
                    resolve(img);
                };
            });

        setTimeout(() => {
            peopleList = [];
        }, 0);

        for (const [orbitIndex, orbit] of config.entries()) {
            const { count, radius, distance, users } = orbit;

            // number of slices in this orbit
            const angleSize = 360 / count;
            // iterate through all users in this orbit
            for (let i = 0; i < count; i++) {
                // if list ends here we stop
                if (!users[i]) break;

                // 30 degrees offset for every additional orbit
                const offset = orbitIndex * 30;
                // final angle for this user at this orbit
                const t = toRad(i * angleSize + offset);

                if (orbitIndex > 0 && users[i].handle) {
                    setTimeout(() => {
                        peopleList.push(`@${users[i].handle}`);
                    }, 0);
                }

                // push a new image loading thingy into the promises list
                // with the coordinates and radius for that circle
                promises.push(
                    preload(users[i].avatar, {
                        centerX: Math.cos(t) * distance + width / 2,
                        centerY: Math.sin(t) * distance + height / 2,
                        radius: radius,
                    }),
                );
            }
        }

        // all drawing happens on the <canvas> element
        // which is hidden. we want the image to be downloadable
        // and resizable in an <img> element so after all the image
        // building promises are done the <img> element src is
        // set to the canvas data
        Promise.allSettled(promises).then(() => {
            circlesImage.src = canvas.toDataURL();
        });
    });

    function handleCopyImage(event: Event) {
        event.preventDefault();
        canvas.toBlob((blob) => {
            if (!blob) return;
            navigator.clipboard
                .write([new ClipboardItem({ [blob.type]: blob })])
                .then(() => console.log("Image copied."));
        });
    }
</script>

<div>
    <button class="btn btn-sm btn-primary mb-2" onclick={handleCopyImage}>
        {$t("stuff.interactions.bolas.copy")}
    </button>
    <button class="btn btn-sm btn-primary mb-2" use:copy={peopleList.join("\n")}>
        {$t("stuff.interactions.bolas.copyPeople")}
    </button>
    <canvas hidden bind:this={canvas} width={600} height={600}></canvas>
    <img bind:this={circlesImage} alt="" />
</div>
