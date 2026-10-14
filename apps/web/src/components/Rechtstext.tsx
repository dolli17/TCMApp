import Link from "next/link";
import { notFound } from "next/navigation";
import { AnmeldeBuehne } from "@/components/AnmeldeBuehne";
import { createServerSupabase } from "@/lib/supabase/server";

export type RechtstextCode = "satzung" | "beitragsordnung" | "datenschutz";

const DATUM = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

/** Die aktive Fassung eines Rechtstexts (legal_documents), öffentlich lesbar. */
export async function ladeRechtstext(code: RechtstextCode) {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("legal_documents")
    .select("code, version, title, body_md, valid_from")
    .eq("code", code)
    .eq("active", true)
    .maybeSingle();
  return data;
}

/** „Version 2, gültig ab 01.10.2026“ */
export function fassung(d: { version: number; valid_from: string }): string {
  return `Version ${d.version}, gültig ab ${DATUM.format(new Date(`${d.valid_from}T12:00:00`))}`;
}

/** **fett** im Fließtext; mehr Auszeichnung brauchen die Texte nicht. */
function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((teil, i) =>
    teil.startsWith("**") && teil.endsWith("**") ? <strong key={i}>{teil.slice(2, -2)}</strong> : teil,
  );
}

/**
 * Ein schmaler Markdown-Leser für die Rechtstexte: Überschriften (#, ##),
 * Aufzählungen (- ) und Absätze. Die Texte schreibt der Vorstand, keine
 * Fremden – trotzdem kein dangerouslySetInnerHTML, alles geht als Text durch
 * React.
 */
export function MarkdownText({ md, ohneTitel = false }: { md: string; ohneTitel?: boolean }) {
  const bloecke = md.replace(/\r\n/g, "\n").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <>
      {bloecke.map((block, i) => {
        if (/^#{1,6}\s/.test(block)) {
          const ebene = /^#+/.exec(block)![0].length;
          // Die erste Überschrift wiederholt den Titel der Bühne.
          if (ohneTitel && i === 0 && ebene === 1) return null;
          const text = block.replace(/^#+\s*/, "");
          return ebene <= 2 ? <h2 key={i}>{inline(text)}</h2> : <h3 key={i}>{inline(text)}</h3>;
        }
        const zeilen = block.split("\n");
        if (zeilen.every((z) => /^[-*]\s/.test(z))) {
          return (
            <ul key={i}>
              {zeilen.map((z, j) => (
                <li key={j}>{inline(z.replace(/^[-*]\s+/, ""))}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i}>
            {zeilen.map((z, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {inline(z)}
              </span>
            ))}
          </p>
        );
      })}
    </>
  );
}

/** Satzung oder Beitragsordnung als öffentliche Seite. */
export async function RechtstextSeite({ code, unterzeile }: { code: RechtstextCode; unterzeile: string }) {
  const d = await ladeRechtstext(code);
  if (!d) notFound();

  return (
    <AnmeldeBuehne titel={`${d.title}.`} unterzeile={unterzeile} breit klasse="rechtstext">
      <p className="unterzeile">{fassung(d)}</p>
      <MarkdownText md={d.body_md} ohneTitel />
      <p className="beschreibung" style={{ marginTop: 24 }}>
        <Link href="/datenschutz">Datenschutz</Link> · <Link href="/impressum">Impressum</Link> ·{" "}
        <Link href="/">Zur App</Link>
      </p>
    </AnmeldeBuehne>
  );
}
