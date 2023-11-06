<script lang="ts">
  import type {
    CirclesOptionsType,
    InteractionsDataType,
    InteractionsType,
    ProfileType
  } from '$lib/types';
  import { DO_NOT_INCLUDE_THESE } from '$lib/utils';
  import { onMount } from 'svelte';

  let canvas: HTMLCanvasElement;
  let context: CanvasRenderingContext2D | null;

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

  onMount(async () => {
    context = canvas.getContext('2d');
    if (!context) return;
    if (!data || !options) return;

    let interactionsList: InteractionsType[] = [];

    if (options.include_sent) {
      interactionsList = interactionsList.concat(data.sent ?? []);
    }
    if (options.include_rcvd) {
      interactionsList = interactionsList.concat(data.rcvd ?? []);
    }

    if (options.remove_bots) {
      interactionsList = interactionsList.filter((x) => !DO_NOT_INCLUDE_THESE.includes(x._id));
    }

    const summedList: { [key: string]: InteractionsType } = {};
    interactionsList.forEach((x) => {
      if (x._id in summedList) {
        summedList[x._id].total += x.total;
        summedList[x._id].points += x.points;
      } else {
        summedList[x._id] = {
          _id: x._id,
          profile: x.profile,
          total: x.total,
          points: x.points
        };
      }
    });

    interactionsList = Object.values(summedList).sort((a, b) => {
      return (b.points as number) - (a.points as number);
    });

    const distances = [[], [0, 210, 0, 0], [0, 160, 250, 0], [0, 120, 196, 260]];
    const radiuss = [[], [125, 55, 0, 0], [95, 42, 32, 0], [75, 32, 28, 22]];

    let config = [
      { distance: 0, count: 1, radius: radiuss[options.orbits][0], users: [profile] },
      {
        distance: distances[options.orbits][1],
        count: 10,
        radius: radiuss[options.orbits][1],
        users: interactionsList.slice(0, 10).map((x) => x.profile)
      },
      {
        distance: distances[options.orbits][2],
        count: 20,
        radius: radiuss[options.orbits][2],
        users: interactionsList.slice(10, 30).map((x) => x.profile)
      },
      {
        distance: distances[options.orbits][3],
        count: 30,
        radius: radiuss[options.orbits][3],
        users: interactionsList.slice(30, 60).map((x) => x.profile)
      }
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
      const textFrom = data?.date?.start.format('L');
      const textTo = data?.date?.end.format('L');
      const textFull = `${textFrom} - ${textTo}`;
      context.font = '20px Arial';
      context.fillStyle = textColor;
      context.fillText(textFull, 5, 25);
    }

    if (options.add_watermark) {
      context.font = '20px Arial';
      context.fillStyle = textColor;
      context.fillText('wolfgang.raios.xyz', 428, 25);
    }

    // loop over the layers
    for (const [layerIndex, layer] of config.entries()) {
      const { count, radius, distance, users } = layer;

      const angleSize = 360 / count;
      for (let i = 0; i < count; i++) {
        const offset = layerIndex * 30;
        const r = toRad(i * angleSize + offset);
        const centerX = Math.cos(r) * distance + width / 2;
        const centerY = Math.sin(r) * distance + height / 2;

        if (!users[i]) break;

        const img = new Image();
        if (users[i].avatar) {
          img.src = users[i].avatar as string;
        } else {
          img.src = '/person-fill.svg';
        }
        img.onload = function () {
          context?.save();
          context?.beginPath();
          context?.arc(centerX, centerY, radius, 0, 2 * Math.PI, false);
          context?.clip();
          context?.drawImage(img, centerX - radius, centerY - radius, radius * 2, radius * 2);
          context?.restore();
        };
        img.onerror = async function () {
          const newprofileRes = await fetch('/api/update', {
            method: 'POST',
            body: JSON.stringify({
              did: users[i].did
            }),
            headers: { 'Content-type': 'application/json' }
          });
          const newprofile = await newprofileRes.json();
          if (newprofile && newprofile.avatar) {
            img.src = newprofile.avatar;
          } else {
            img.src = '/person-fill.svg';
          }
        };
      }
    }
  });
</script>

<canvas bind:this={canvas} width={600} height={600} />
