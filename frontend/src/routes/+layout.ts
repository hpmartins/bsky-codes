import { loadTranslations } from '$lib/translations';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ url }) => {
  const { pathname } = url;

  const initLocale = 'en';

  await loadTranslations(initLocale, pathname);

  return {};
}