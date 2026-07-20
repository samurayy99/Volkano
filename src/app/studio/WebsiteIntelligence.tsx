"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useExperience } from "./ExperienceProvider";
import type { Locale } from "./experienceState";

const findings = {
  en: [
    ["POSITIONING", "Can a first-time visitor explain the offer after one screen?"],
    ["VISUAL HIERARCHY", "Does one primary action clearly lead the composition?"],
    ["MOBILE UX", "Do density, reach and reading order survive a narrow viewport?"],
    ["CONTENT CLARITY", "Are claims supported by specific evidence?"],
    ["PERFORMANCE FOUNDATIONS", "Are media and interaction costs introduced deliberately?"],
    ["CONVERSION FRICTION", "How many decisions stand between intent and contact?"],
  ],
  de: [
    ["POSITIONIERUNG", "Kann ein neuer Besucher das Angebot nach einem Screen erklären?"],
    ["VISUELLE HIERARCHIE", "Führt eine primäre Aktion klar durch die Komposition?"],
    ["MOBILE UX", "Bleiben Dichte, Erreichbarkeit und Lesereihenfolge auf kleinen Screens erhalten?"],
    ["INHALTSKLARHEIT", "Werden Behauptungen durch konkrete Beweise gestützt?"],
    ["PERFORMANCE-BASIS", "Werden Medien- und Interaktionskosten bewusst eingeführt?"],
    ["CONVERSION-REIBUNG", "Wie viele Entscheidungen liegen zwischen Absicht und Kontakt?"],
  ],
} as const;

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
}

export function WebsiteIntelligence({ locale }: { locale: Locale }) {
  const { state, dispatch } = useExperience();
  const [error, setError] = useState("");
  const timers = useRef<number[]>([]);

  useEffect(
    () => () => {
      timers.current.forEach(window.clearTimeout);
    },
    [],
  );

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    timers.current.forEach(window.clearTimeout);
    const url = normalizeUrl(state.audit.url);
    if (!url) {
      setError(locale === "en" ? "Enter a valid domain." : "Gib eine gültige Domain ein.");
      return;
    }
    setError("");
    dispatch({ type: "SET_AUDIT", audit: { phase: "validating", url: url.hostname } });
    timers.current.push(
      window.setTimeout(() => {
        dispatch({ type: "SET_AUDIT", audit: { phase: "previewing", url: url.hostname } });
      }, 650),
      window.setTimeout(() => {
        dispatch({ type: "SET_AUDIT", audit: { phase: "complete", url: url.hostname } });
      }, 1450),
    );
  };

  const busy = state.audit.phase === "validating" || state.audit.phase === "previewing";

  return (
    <div className="intelligence-demo">
      <div className="demo-disclosure">
        INTERFACE PROTOTYPE · NO LIVE WEBSITE SCAN
      </div>
      <form onSubmit={submit} noValidate>
        <label htmlFor="audit-url">
          {locale === "en" ? "ENTER YOUR WEBSITE" : "WEBSITE EINGEBEN"}
        </label>
        <div className="audit-input-row">
          <input
            id="audit-url"
            inputMode="url"
            autoComplete="url"
            placeholder="yourstudio.com"
            value={state.audit.url}
            onChange={(event) =>
              dispatch({
                type: "SET_AUDIT",
                audit: { phase: "idle", url: event.target.value },
              })
            }
          />
          <button type="submit" disabled={busy}>
            {busy
              ? locale === "en"
                ? "BUILDING PREVIEW"
                : "VORSCHAU WIRD GEBAUT"
              : locale === "en"
                ? "PREVIEW REVIEW"
                : "REVIEW ANZEIGEN"}
          </button>
        </div>
        {error ? <p className="field-error">{error}</p> : null}
      </form>
      {state.audit.phase === "complete" ? (
        <div className="audit-result" aria-live="polite">
          <div className="audit-result-head">
            <span>{state.audit.url}</span>
            <strong>{locale === "en" ? "PREVIEW FRAMEWORK" : "VORSCHAU-RAHMEN"}</strong>
          </div>
          <div className="audit-findings">
            {findings[locale].map(([label, text]) => (
              <article key={label}>
                <span>{label}</span>
                <p>{text}</p>
              </article>
            ))}
          </div>
          <p className="audit-note">
            {locale === "en"
              ? "These are example review lenses, not findings from a network scan. A live product would only report evidence it actually retrieved."
              : "Dies sind beispielhafte Review-Linsen, keine Resultate eines Netzwerk-Scans. Ein Live-Produkt würde nur tatsächlich erhobene Evidenz ausgeben."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
