<script lang="ts">
  import type { CirclesOptionsType, InteractionsDataType, InteractionsType, ProfileType } from '$lib/types';
  import { DO_NOT_INCLUDE_THESE } from '$lib/utils';
  import { onMount } from 'svelte';
  import dayjs from 'dayjs';

  let canvas: HTMLCanvasElement;
  let context: CanvasRenderingContext2D | null;
  let circlesImage: HTMLImageElement;

  export let profile: ProfileType;
  export let data: InteractionsDataType;
  export let options: CirclesOptionsType;

  function hex_is_light(color: string) {
    const hex = color.replace('#', '');
    const c_r = parseInt(hex.substring(0, 0 + 2), 16);
    const c_g = parseInt(hex.substring(2, 2 + 2), 16);
    const c_b = parseInt(hex.substring(4, 4 + 2), 16);
    const brightness = (c_r * 299 + c_g * 587 + c_b * 114) / 1000;
    return brightness > 155;
  }
  const toRad = (x: number) => x * (Math.PI / 180);

  onMount(() => {
    context = canvas.getContext('2d');

    if (!context) return;
    if (!data || !options) return;

    let interactionsList: InteractionsType[] | undefined;
    if (options.include_sent && options.include_rcvd) {
      interactionsList = data.both;
    } else if (options.include_sent) {
      interactionsList = data.sent;
    } else if (options.include_rcvd) {
      interactionsList = data.rcvd;
    }

    if (!interactionsList || interactionsList.length === 0) return;

    if (options.remove_bots) {
      interactionsList = interactionsList.filter((x) => !DO_NOT_INCLUDE_THESE.includes(x._id));
    }

    const distances: { [key: number]: number[] } = {
      1: [0, 210, 0, 0],
      2: [0, 160, 250, 0],
      3: [0, 120, 196, 260],
    };

    const radiuses: { [key: number]: number[] } = {
      1: [125, 55, 0, 0],
      2: [95, 42, 32, 0],
      3: [75, 32, 28, 22],
    };

    let config = [
      { distance: 0, count: 1, radius: radiuses[options.orbits][0], users: [profile] },
      {
        distance: distances[options.orbits][1],
        count: 10,
        radius: radiuses[options.orbits][1],
        users: interactionsList.slice(0, 10).map((x) => x.profile),
      },
      {
        distance: distances[options.orbits][2],
        count: 20,
        radius: radiuses[options.orbits][2],
        users: interactionsList.slice(10, 30).map((x) => x.profile),
      },
      {
        distance: distances[options.orbits][3],
        count: 30,
        radius: radiuses[options.orbits][3],
        users: interactionsList.slice(30, 60).map((x) => x.profile),
      },
    ];
    config = config.slice(0, options.orbits + 1);

    const width = 600;
    const height = 600;
    const textColor = hex_is_light(options.bg_color) ? '#000000' : '#CCCCCC';

    context.fillStyle = options.bg_color;
    context.fillRect(0, 0, width, height);

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'medium';

    if (options.add_date) {
      const type = data?.date?.type ?? '';
      let textFull = '';
      if (type === 'weekly') {
        const textFrom = data?.date?.start?.format('L');
        const textTo = data?.date?.end?.format('L');
        textFull = `${textFrom} - ${textTo}`;
      } else if (type === 'all') {
        textFull = `${dayjs().format('L')} (all time)`;
      } else if (type === 'month') {
        textFull = `${dayjs().format('L')} (month)`;
      } else if (type === 'week') {
        const textFrom = dayjs().subtract(1, 'week').format('L');
        const textTo = dayjs().format('L');
        textFull = `${textFrom} - ${textTo}`;
      } else if (type === 'day') {
        const textFrom = dayjs().subtract(24, 'hour').format('L');
        const textTo = dayjs().format('L');
        textFull = `${textFrom} - ${textTo}`;
      }
      context.font = '20px Arial';
      context.fillStyle = textColor;
      context.fillText(textFull, 12, 30);
    }

    if (options.add_watermark) {
      context.font = '20px Arial';
      context.fillStyle = textColor;
      context.textAlign = 'right';
      context.fillText('wolfgang.raios.xyz', 588, 30);
    }

    if (options.add_border) {
      context.strokeStyle = options.border_color;
      context.lineWidth = 15;
      context.beginPath();
      context.roundRect(0, 0, width, height, 15);
      context.stroke();
    }

    const promises = [];

    const preload = (user: { [key: string]: string }, opt: { [key: string]: number }) =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.setAttribute('crossOrigin', 'anonymous');
        if (user.avatar) {
          img.src = '/api/proxy?' + new URLSearchParams({ src: user.avatar as string });
        } else {
          img.src = '/person-fill.svg';
        }
        img.onload = function () {
          if (!context) return reject;
          context.save();
          context.beginPath();
          context.arc(opt.centerX, opt.centerY, opt.radius, 0, 2 * Math.PI, false);
          context.clip();
          context.drawImage(
            img,
            opt.centerX - opt.radius,
            opt.centerY - opt.radius,
            opt.radius * 2,
            opt.radius * 2,
          );
          context.restore();
          resolve(img);
        };
        img.onerror = async function () {
          const newprofileRes = await fetch('/api/update', {
            method: 'POST',
            body: JSON.stringify({
              did: user.did,
            }),
            headers: { 'Content-type': 'application/json' },
          });
          const newprofile = await newprofileRes.json();
          if (newprofile && newprofile.avatar) {
            img.src = newprofile.avatar;
          } else {
            img.src = '/person-fill.svg';
          }
          resolve(img);
        };
      });

    for (const [layerIndex, layer] of config.entries()) {
      const { count, radius, distance, users } = layer;

      const angleSize = 360 / count;
      for (let i = 0; i < count; i++) {
        if (!users[i]) break;

        const offset = layerIndex * 30;
        const r = toRad(i * angleSize + offset);

        promises.push(
          preload(
            { avatar: users[i].avatar, did: users[i].did },
            {
              centerX: Math.cos(r) * distance + width / 2,
              centerY: Math.sin(r) * distance + height / 2,
              radius: radius,
            },
          ),
        );
      }
    }

    Promise.allSettled(promises).then(() => {
      circlesImage.src = canvas.toDataURL();
    });
  });

  function handleCopy() {
    canvas.toBlob((blob) => {
      if (!blob) return;
      navigator.clipboard
        .write([new ClipboardItem({ [blob.type]: blob })])
        .then(() => console.log('Image copied.'));
    });
  }
</script>

<button class="btn btn-sm btn-primary mb-2" on:click|preventDefault={handleCopy}>Copy image</button>
<canvas hidden bind:this={canvas} width={600} height={600} />
<img bind:this={circlesImage} alt="" />
