import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async () => {
	return {
		navbar: [
            {
                href: "/interactions",
                text: "Interactions",
            },
            {
                href: "/blocks",
                text: "Blocks",
            },
        ]
	};
};
