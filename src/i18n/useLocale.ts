"use client";

import { useCallback, useEffect, useState } from "react";
import {
  isWrittenLocale,
  type Locale,
  type Messages,
  messagesFor,
} from "./messages";

const STORAGE_KEY = "lenox.locale";

/**
 * Lenox does not ask which language you speak. He assumes, states the assumption,
 * and lets you correct it — asking is a cookie-banner move, and he is supposed to
 * have a point of view. German is the assumption for anything he cannot read.
 */
function detect(): Locale {
  if (typeof window === "undefined") return "de";

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && isWrittenLocale(stored)) {
    return stored;
  }

  const tag = navigator.language.slice(0, 2).toLowerCase();
  return isWrittenLocale(tag) ? tag : "de";
}

export function useLocale(): {
  locale: Locale;
  setLocale: (next: Locale) => void;
  m: Messages;
} {
  // Server renders German; the browser corrects it after hydration. Reading
  // navigator/localStorage during render would mismatch the server HTML.
  const [locale, setLocaleState] = useState<Locale>("de");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setLocaleState(detect()));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    if (!isWrittenLocale(next)) return;
    setLocaleState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.lang = next;
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return { locale, setLocale, m: messagesFor(locale) };
}
