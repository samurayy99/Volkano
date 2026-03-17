'use client';

export function SiteShell({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <section className="site-shell" aria-label="Site shell">
      <a
        href="mailto:hello@volkano.dev"
        className="back-cta"
        aria-label="Book a Call"
      >
        Book a Call
      </a>

      <div className="back-grid">
        <article className="back-panel">
          <p className="back-panel-label">Case File</p>
          <ul className="back-list">
            <li>
              Engineering-led creative practice. Systems, simulations, and
              interfaces built from first principles.
            </li>
          </ul>
        </article>

        <article className="back-panel">
          <p className="back-panel-label">Lab</p>
          <ul className="back-list">
            <li>Sketches, prototypes, and artifacts from the workbench.</li>
          </ul>
        </article>

        <article className="back-panel">
          <p className="back-panel-label">Note</p>
          <ul className="back-list back-list-contact">
            <li>Built with discipline.</li>
          </ul>
        </article>
      </div>
    </section>
  );
}
