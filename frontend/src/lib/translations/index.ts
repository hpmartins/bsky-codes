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
      key: "layout",
      loader: async () => (await import("./en/layout.json")).default,
    },
    {
      locale: "en",
      key: "home",
      routes: ["/"],
      loader: async () => (await import("./en/home.json")).default,
    },
    {
      locale: "en",
      key: "features",
      loader: async () => (await import("./en/features.json")).default,
    },
    {
      locale: "pt",
      key: "layout",
      loader: async () => (await import("./pt/layout.json")).default,
    },
    {
      locale: "pt",
      key: "home",
      routes: ["/"],
      loader: async () => (await import("./pt/home.json")).default,
    },
    {
      locale: "pt",
      key: "features",
      loader: async () => (await import("./pt/features.json")).default,
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
