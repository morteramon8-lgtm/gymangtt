import { Link } from "@tanstack/react-router";

import { LEGAL, legalIncomplete } from "@/lib/legal-config";

export type LegalSection = { title: string; body: Array<string | string[]> };

export function LegalPage({
  title,
  intro,
  sections,
}: {
  title: string;
  intro?: string;
  sections: LegalSection[];
}) {
  return (
    <div style={{ minHeight: "100vh", padding: "24px 16px" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <Link to="/" className="btn btn-ghost" style={{ marginBottom: 16, display: "inline-block" }}>
          ← Volver
        </Link>
        <div className="panel">
          <div className="panel-head">{title}</div>
          <div className="modal-body" style={{ lineHeight: 1.6 }}>
            {legalIncomplete() ? (
              <div className="alert badge-red" style={{ marginBottom: 12 }}>
                BORRADOR: faltan completar los datos legales en src/lib/legal-config.ts antes de publicar este documento.
              </div>
            ) : null}
            <p className="muted text-xs">Última actualización: {LEGAL.actualizado}</p>
            {intro ? <p style={{ marginTop: 12 }}>{intro}</p> : null}
            {sections.map((section, i) => (
              <section key={section.title} style={{ marginTop: 20 }}>
                <h2 style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>
                  {i + 1}. {section.title}
                </h2>
                {section.body.map((block, j) =>
                  Array.isArray(block) ? (
                    <ul key={j} style={{ paddingLeft: 20, listStyle: "disc", margin: "8px 0" }}>
                      {block.map((item) => (
                        <li key={item} style={{ marginBottom: 4 }}>
                          {item}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p key={j} style={{ margin: "8px 0" }}>
                      {block}
                    </p>
                  ),
                )}
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
