import i18n, { type Config } from "sveltekit-i18n";
import lang from "./lang.json";

export const defaultLocale = "en";

export const config: Config<
  {
    date?: string;
    count?: number;
    link?: string;
  },
  never
> = {
  translations: {
    en: { lang },
    pt: { lang },
  },
  loaders: [
    {
      locale: "en",
      key: "stuff",
      loader: async () => (await import("./en/stuff.json")).default,
    },
    {
      locale: "pt",
      key: "stuff",
      loader: async () => (await import("./pt/stuff.json")).default,
    },
  ],
};

export const {
  t,
  loading,
  locales,
  locale,
  translations,
  loadTranslations,
  addTranslations,
  setLocale,
  setRoute,
} = new i18n(config);

loading.subscribe(
  ($loading) => $loading && console.log("Loading translations...")
);
