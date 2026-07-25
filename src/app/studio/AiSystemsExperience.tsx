"use client";

import Link from "next/link";
import { aiModules, copy } from "./content";
import { useExperience } from "./ExperienceProvider";
import { WebsiteIntelligence } from "./WebsiteIntelligence";
import styles from "./AiSystemsExperience.module.css";

const workflow = {
  en: ["UNDERSTAND THE CONTEXT", "STRUCTURE THE DECISION", "PREPARE THE ACTION", "KEEP THE HUMAN IN CONTROL"],
  de: ["KONTEXT VERSTEHEN", "ENTSCHEIDUNG STRUKTURIEREN", "AKTION VORBEREITEN", "MENSCHLICHE KONTROLLE BEWAHREN"],
} as const;

export function AiSystemsExperience() {
  const { state, dispatch } = useExperience();
  const locale = state.locale;
  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <Link href="/">{copy.studioName}</Link>
        <nav>
          <Link href="/#capabilities">STUDIO</Link>
          <Link href="/#contact">CONTACT</Link>
          <button
            type="button"
            onClick={() => {
              const next = locale === "en" ? "de" : "en";
              dispatch({ type: "SET_LOCALE", locale: next });
              const url = new URL(window.location.href);
              url.searchParams.set("lang", next);
              window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
            }}
          >
            {locale.toUpperCase()}
          </button>
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroIndex}>AI / 01</div>
        <h1>
          <span>SYSTEMS THAT</span>
          <span>UNDERSTAND,</span>
          <span>DECIDE AND ACT.</span>
        </h1>
        <p>
          {locale === "en"
            ? "Custom AI systems should make the next useful action clearer, not hide uncertainty behind a magic interface."
            : "Individuelle AI-Systeme sollten die nächste sinnvolle Aktion klarer machen und Unsicherheit nicht hinter einem magischen Interface verstecken."}
        </p>
      </section>

      <section className={styles.principles}>
        {workflow[locale].map((item, index) => (
          <div key={item}><span>0{index + 1}</span><strong>{item}</strong></div>
        ))}
      </section>

      <section className={styles.demoSection}>
        <header>
          <span>01 / INTERACTIVE</span>
          <h2>WEBSITE INTELLIGENCE</h2>
          <p>{aiModules[0].body[locale]}</p>
        </header>
        <WebsiteIntelligence locale={locale} />
      </section>

      <section className={styles.systemList}>
        {aiModules.slice(1).map((module) => (
          <article key={module.title}>
            <span>{module.index}</span>
            <h2>{module.title}</h2>
            <p>{module.body[locale]}</p>
            <small>{module.state} · NO LIVE EXTERNAL ACTION</small>
          </article>
        ))}
        <article>
          <span>05</span>
          <h2>BOOKING HANDOFF</h2>
          <p>
            {locale === "en"
              ? "Prepare a structured introduction and hand the visitor to a real booking channel with explicit consent."
              : "Bereitet eine strukturierte Einführung vor und übergibt den Besucher mit expliziter Zustimmung an einen realen Buchungskanal."}
          </p>
          <small>PREVIEW · NO LIVE CALENDAR CONNECTION</small>
        </article>
      </section>

      <footer className={styles.footer}>
        <div>
          <span>READY TO DEFINE THE REAL SYSTEM?</span>
          <h2>{locale === "en" ? "BRING THE BUSINESS PROBLEM." : "BRING DAS GESCHÄFTSPROBLEM."}</h2>
        </div>
        <a href="mailto:hello@volkano.dev?subject=AI%20systems%20inquiry">
          {locale === "en" ? "START A CONVERSATION" : "GESPRÄCH STARTEN"}
        </a>
      </footer>
    </main>
  );
}
