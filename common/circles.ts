import dayjs, { Dayjs } from 'dayjs';
import localizedFormat from 'dayjs/plugin/localizedFormat';
dayjs.extend(localizedFormat);

import canvas, { loadImage } from 'canvas';
import { InteractionsType, SimpleProfileType } from './types';

function hex_is_light(color: string) {
    const hex = color.replace('#', '');
    const c_r = parseInt(hex.substring(0, 0 + 2), 16);
    const c_g = parseInt(hex.substring(2, 2 + 2), 16);
    const c_b = parseInt(hex.substring(4, 4 + 2), 16);
    const brightness = (c_r * 299 + c_g * 587 + c_b * 114) / 1000;
    return brightness > 155;
}
const toRad = (x: number) => x * (Math.PI / 180);

export const DO_NOT_INCLUDE_THESE = [
    'did:plc:xxno7p4xtpkxtn4ok6prtlcb', // @lovefairy.nl
    'did:plc:db645kt5coo7teuoxdjhq34x', // @blueskybaddies.bsky.social
    'did:plc:y4rd5hesgwwbkblvkkidfs73', // @wolfgang
    'did:plc:iw47x7htlvpkbbizqn2sgnks' // @whatsmid
];

export const createCirclesImage = async (
    profile: SimpleProfileType,
    data: { [key: string]: InteractionsType[] },
    date: { type: string; start?: Dayjs; end?: Dayjs },
    locale: string | undefined,
) => {
    const width = 600;
    const height = 600;
    const cv = canvas.createCanvas(width, height);
    const context = cv.getContext('2d');

    if (!locale) locale = 'en';

    const options = {
        orbits: 2,
        include_sent: true,
        include_rcvd: true,
        remove_bots: true,
        add_watermark: true,
        add_date: true,
        bg_color: '#1D428A',
        add_border: true,
        border_color: '#FFC72C'
    };

    // decides which interactions to use based on the options
    let interactionsList: InteractionsType[] | undefined;
    if (options.include_sent && options.include_rcvd) {
        interactionsList = data.both;
    } else if (options.include_sent) {
        interactionsList = data.sent;
    } else if (options.include_rcvd) {
        interactionsList = data.rcvd;
    }

    // no image if no data
    if (!interactionsList || interactionsList.length === 0) return;

    // filter bots
    if (options.remove_bots) {
        interactionsList = interactionsList.filter((x) => !DO_NOT_INCLUDE_THESE.includes(x._id));
    }

    // - radial distances for each number of orbits
    // - i chose this manually
    const distances: { [key: number]: number[] } = {
        1: [0, 210, 0, 0],
        2: [0, 158, 246, 0],
        3: [0, 120, 196, 260]
    };

    // radiuses for every orbit for each number of orbits
    const radiuses: { [key: number]: number[] } = {
        1: [125, 55, 0, 0],
        2: [95, 42, 32, 0],
        3: [75, 32, 28, 22]
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
            users: interactionsList.slice(0, 10).map((x) => x.profile)
        },
        {
            distance: distances[options.orbits][2],
            count: 20,
            radius: radiuses[options.orbits][2],
            users: interactionsList.slice(10, 30).map((x) => x.profile)
        },
        {
            distance: distances[options.orbits][3],
            count: 30,
            radius: radiuses[options.orbits][3],
            users: interactionsList.slice(30, 60).map((x) => x.profile)
        }
    ];
    config = config.slice(0, options.orbits + 1);

    const textColor = hex_is_light(options.bg_color) ? '#000000' : '#CCCCCC';

    context.fillStyle = options.bg_color;
    context.fillRect(0, 0, width, height);

    context.imageSmoothingEnabled = true;
    // context.imageSmoothingQuality = 'medium';

    // date on top left corner
    if (options.add_date) {
        let textFull = '';
        if (date.type === 'weekly') {
            const textFrom = date.start?.toDate().toLocaleDateString(locale);
            const textTo = date.end?.toDate().toLocaleDateString(locale);
            textFull = `${textFrom} - ${textTo}`;
        } else if (date.type === 'all') {
            textFull = `${new Date().toLocaleDateString(locale)} (all time)`;
        } else if (date.type === 'month') {
            textFull = `${new Date().toLocaleDateString(locale)} (month)`;
        } else if (date.type === 'week') {
            const textFrom = dayjs().subtract(1, 'week').toDate().toLocaleDateString(locale);
            const textTo = new Date().toLocaleDateString(locale);
            textFull = `${textFrom} - ${textTo}`;
        } else if (date.type === 'day') {
            const textFrom = dayjs().subtract(24, 'hour').toDate().toLocaleDateString(locale);
            const textTo = new Date().toLocaleDateString(locale);
            textFull = `${textFrom} - ${textTo}`;
        }
        context.font = '20px Arial';
        context.fillStyle = textColor;
        context.fillText(textFull, 12, 28);
    }

    // site watermark on top right corner
    if (options.add_watermark) {
        context.font = '20px Arial';
        context.fillStyle = textColor;
        context.textAlign = 'right';
        context.fillText('wolfgang.raios.xyz', 588, 28);
    }

    // add rounded border
    if (options.add_border) {
        context.strokeStyle = options.border_color;
        context.lineWidth = 15;
        context.beginPath();
        context.roundRect(0, 0, width, height, 15);
        context.stroke();
    }
    const promises: Promise<any>[] = [];

    // this will create the image, load the avatar and return a promise
    const preload = (user: { [key: string]: string | undefined }, opt: { [key: string]: number }) =>
        new Promise(async (resolve, reject) => {
            const avatar = user.avatar ?? '';
            return loadImage(avatar)
                .then((img) => {
                    context.save();
                    // this draws a circle centered at the image position
                    context.beginPath();
                    context.arc(opt.centerX, opt.centerY, opt.radius, 0, 2 * Math.PI, false);
                    // then clips whatever is out
                    context.clip();
                    // this draws the img at some position with some radius
                    context.drawImage(
                        img,
                        opt.centerX - opt.radius,
                        opt.centerY - opt.radius,
                        opt.radius * 2,
                        opt.radius * 2
                    );
                    context.restore();
                    return resolve(img);
                })
                .catch(() => reject);
        });

    // now we iterate the orbits to actually build the full image
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

            // push a new image loading thingy into the promises list
            // with the coordinates and radius for that circle
            promises.push(
                preload(
                    { avatar: users[i].avatar, did: users[i].did },
                    {
                        centerX: Math.cos(t) * distance + width / 2,
                        centerY: Math.sin(t) * distance + height / 2,
                        radius: radius
                    }
                )
            );
        }
    }

    const t = await Promise.allSettled(promises).then(() => cv.toBuffer());
    return t;
};
