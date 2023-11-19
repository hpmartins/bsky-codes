import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async () => {
  return {
    navbar: [
      {
        href: '/interactions',
        text: 'Interactions',
        icon: 'people',
      },
      {
        href: '/blocks',
        text: 'Blocks',
        icon: 'ban',
      },
      {
        href: '/top/blocked',
        text: 'Top blocked',
        icon: 'x-circle',
      },
      {
        href: '/top/posters',
        text: 'Top posters',
        icon: 'graph-up-arrow',
      },
    ],
  };
};
