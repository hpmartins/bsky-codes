import i18n from 'sveltekit-i18n';

/** @type {import('sveltekit-i18n').Config} */
const config = ({
  loaders: [
    {
      locale: 'en',
      key: 'layout',
      loader: async () => (
        await import('./en/layout.json')
      ).default,
    },
    {
      locale: 'en',
      key: 'home',
      routes: ['/'], // you can use regexes as well!
      loader: async () => (
        await import('./en/home.json')
      ).default,
    },
    {
      locale: 'en',
      key: 'features',
      loader: async () => (
        await import('./en/features.json')
      ).default,
    },
    {
      locale: 'pt',
      key: 'layout',
      loader: async () => (
        await import('./pt/layout.json')
      ).default,
    },
    {
      locale: 'pt',
      key: 'home',
      routes: ['/'],
      loader: async () => (
        await import('./pt/home.json')
      ).default,
    },
    {
      locale: 'pt',
      key: 'features',
      loader: async () => (
        await import('./pt/features.json')
      ).default,
    },
  ],
});

export const { t, locale, locales, loading, loadTranslations } = new i18n(config);