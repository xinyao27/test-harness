import {
  getLocale,
  harnessBaseLocale,
  harnessLocales,
  isHarnessLocale,
  messages,
  setLocale,
  type HarnessLocale,
} from "@test-harness/i18n";
import { create } from "zustand";

export { messages as m };
export { harnessLocales };
export type AppLocale = HarnessLocale;

function readInitialLocale(): AppLocale {
  try {
    const locale = getLocale();
    return isHarnessLocale(locale) ? locale : harnessBaseLocale;
  } catch {
    return harnessBaseLocale;
  }
}

function syncBrowserLocale(locale: AppLocale) {
  if (typeof document === "undefined") return;

  document.documentElement.lang = locale;
  document.title = messages.app_title({}, { locale });
}

const initialLocale = readInitialLocale();
syncBrowserLocale(initialLocale);

type LocaleState = {
  locale: AppLocale;
  setAppLocale: (locale: AppLocale) => void;
};

export const useLocaleStore = create<LocaleState>((set) => ({
  locale: initialLocale,
  setAppLocale: (locale) => {
    void setLocale(locale, { reload: false });
    syncBrowserLocale(locale);
    set({ locale });
  },
}));

export function useI18n() {
  const locale = useLocaleStore((state) => state.locale);
  const setAppLocale = useLocaleStore((state) => state.setAppLocale);

  return {
    locale,
    setLocale: setAppLocale,
    m: messages,
  };
}
