import {
  einladungTitel,
  kandidatMarken,
  meineMannschaftLesen,
  spielerName,
  telefonHref,
  translateDbError,
  verfallText,
  MANNSCHAFT_TEXT,
  type MannschaftsKandidat,
  type MeineMannschaftsEinladung,
} from "@tcm/core";
import { createServerSupabase, getCurrentMember } from "@/lib/supabase/server";
import { Fehlerzustand } from "@/components/Fehlerzustand";
import { KontoUnterseite } from "@/components/KontoUnterseite";
import { Leerzustand } from "@/components/Leerzustand";
import { LiveSuche } from "@/components/LiveSuche";
import {
  AktionsKnopf,
  BestaetigterKnopf,
  EinladungAntwort,
  MannschaftRahmen,
} from "@/components/MannschaftAktionen";
import { austragen, einladen, einladungZurueckziehen } from "./aktionen";

export const dynamic = "force-dynamic";

/** Ohne Suchbegriff nur die ersten paar Vorschläge (Interessenten zuerst). */
const OHNE_SUCHE = 8;

/**
 * Konto › Mannschaft (Vereinsentscheidung vom 02.11.2026)
 *
 * Oben die Einladungen an mich, darunter der Kader. Der Mannschaftsführer
 * sieht zusätzlich die Telefonnummern (nur mit Zustimmung), seine offenen
 * Einladungen und "Spieler hinzufügen". Wer was darf, entscheidet die
 * Datenbank; die Seite zeigt nur, was die RPCs liefern.
 */
export default async function MannschaftSeite({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const suche = (q ?? "").trim().slice(0, 80);
  const supabase = await createServerSupabase();
  const angemeldet = await getCurrentMember();
  const meineId = angemeldet?.member?.id;

  const [mannschaftRes, einladungenRes] = await Promise.all([
    supabase.rpc("meine_mannschaft"),
    supabase.rpc("meine_mannschaft_einladungen"),
  ]);

  const m = mannschaftRes.error ? null : meineMannschaftLesen(mannschaftRes.data);
  const einladungen = (einladungenRes.data ?? []) as MeineMannschaftsEinladung[];

  // Kandidaten nur für den MF; die RPC weist alle anderen ab.
  const kandidatenRes = m?.ich_bin_mf
    ? await supabase.rpc("mannschaft_kandidaten", suche ? { p_suche: suche } : {})
    : null;
  const kandidatenAlle = (kandidatenRes?.data ?? []) as MannschaftsKandidat[];
  const kandidaten = suche ? kandidatenAlle : kandidatenAlle.slice(0, OHNE_SUCHE);

  const ladefehler = mannschaftRes.error ?? einladungenRes.error;

  return (
    <KontoUnterseite
      titel={MANNSCHAFT_TEXT.titel}
      text={m ? (m.ich_bin_mf ? `${m.name} · du bist Mannschaftsführer` : m.name) : undefined}
    >
      <MannschaftRahmen>
        {ladefehler && (
          <Fehlerzustand kompakt titel="Deine Mannschaft ließ sich nicht laden." text={translateDbError(ladefehler)} />
        )}

        {/* --- Einladungen an mich ---------------------------------------- */}
        {einladungen.length > 0 && (
          <section aria-labelledby="h-einladungen" className="mannschaft-abschnitt">
            <div className="sectionlabel"><h2 id="h-einladungen">{MANNSCHAFT_TEXT.einladungenTitel}</h2></div>
            <ul className="gruppe">
              {einladungen.map((e) => (
                <li key={e.id} className="mannschaft-zeile einladung" data-testid="einladung">
                  <div className="wer">
                    <b>{einladungTitel(e)}</b>
                    <small>{verfallText(e.expires_at)}</small>
                  </div>
                  <EinladungAntwort einladung={e} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {!ladefehler && !m && einladungen.length === 0 && (
          <Leerzustand text="Du bist in keiner Mannschaft. Der Mannschaftsführer kann dich einladen; Interesse meldest du unter Konto › Tennis." />
        )}

        {/* --- Kader -------------------------------------------------------- */}
        {m && (
          <section aria-labelledby="h-kader" className="mannschaft-abschnitt">
            <div className="sectionlabel">
              <h2 id="h-kader">{MANNSCHAFT_TEXT.kaderTitel} {m.name}</h2>
            </div>
            <ul className="gruppe" aria-label={`Kader ${m.name}`}>
              {m.kader.map((s) => {
                const name = spielerName(s);
                const ich = s.member_id === meineId;
                const tel = telefonHref(s.telefon);
                return (
                  <li key={s.member_id} className="mannschaft-zeile" data-testid="kader-zeile">
                    <div className="wer">
                      <b>
                        {name}
                        {ich ? " (du)" : ""}
                      </b>
                      <small>
                        {s.tennis_lk ?? "ohne LK"}
                        {s.is_team_captain && <span className="marke-klein gold">{MANNSCHAFT_TEXT.mfMarke}</span>}
                      </small>
                      {m.ich_bin_mf && !ich && (
                        <small>
                          {s.telefon && tel ? (
                            <a href={tel} className="mannschaft-telefon">{s.telefon}</a>
                          ) : (
                            "Nummer nicht freigegeben"
                          )}
                        </small>
                      )}
                    </div>
                    {m.ich_bin_mf && !ich && !s.is_team_captain && (
                      <BestaetigterKnopf
                        label="Austragen"
                        frage={MANNSCHAFT_TEXT.austragenFrage(name, m.name)}
                        bestaetigen="Austragen"
                        aktion={austragen.bind(null, s.member_id)}
                      />
                    )}
                  </li>
                );
              })}
            </ul>

            {!m.ich_bin_mf && meineId && (
              <div className="mannschaft-austreten">
                <BestaetigterKnopf
                  label={MANNSCHAFT_TEXT.austretenKnopf}
                  frage={MANNSCHAFT_TEXT.austretenFrage(m.name)}
                  bestaetigen="Austreten"
                  aktion={austragen.bind(null, meineId)}
                />
              </div>
            )}
            {m.ich_bin_mf && <p className="beschreibung">{MANNSCHAFT_TEXT.mfGesperrt}</p>}
          </section>
        )}

        {/* --- Nur für den MF: offene Einladungen --------------------------- */}
        {m?.ich_bin_mf && (
          <section aria-labelledby="h-offen" className="mannschaft-abschnitt">
            <div className="sectionlabel"><h2 id="h-offen">{MANNSCHAFT_TEXT.offeneTitel}</h2></div>
            <ul className="gruppe">
              {m.offene_einladungen.length === 0 && <li className="leer-zeile">{MANNSCHAFT_TEXT.keineOffenen}</li>}
              {m.offene_einladungen.map((e) => (
                <li key={e.id} className="mannschaft-zeile" data-testid="offene-einladung">
                  <div className="wer">
                    <b>{spielerName(e)}</b>
                    <small>{verfallText(e.expires_at)}</small>
                  </div>
                  <AktionsKnopf label="Zurückziehen" leise aktion={einladungZurueckziehen.bind(null, e.id)} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* --- Nur für den MF: Spieler hinzufügen --------------------------- */}
        {m?.ich_bin_mf && (
          <section aria-labelledby="h-hinzufuegen" className="mannschaft-abschnitt">
            <div className="sectionlabel"><h2 id="h-hinzufuegen">{MANNSCHAFT_TEXT.hinzufuegenTitel}</h2></div>
            <form className="mannschaft-suche" role="search">
              <label className="suchfeld">
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <LiveSuche defaultValue={suche} placeholder="Vor- oder Nachname" aria-label={MANNSCHAFT_TEXT.sucheLabel} />
              </label>
            </form>
            {kandidatenRes?.error ? (
              <Fehlerzustand kompakt titel="Die Vorschläge ließen sich nicht laden." text={translateDbError(kandidatenRes.error)} />
            ) : (
              <ul className="gruppe" aria-label="Vorschläge">
                {kandidaten.length === 0 && <li className="leer-zeile">{MANNSCHAFT_TEXT.sucheLeer}</li>}
                {kandidaten.map((k) => (
                  <li
                    key={k.member_id}
                    className={`mannschaft-zeile${k.eingeladen ? " ausgegraut" : ""}`}
                    data-testid="kandidat"
                  >
                    <div className="wer">
                      <b>{spielerName(k)}</b>
                      <small>
                        {k.tennis_lk ?? "ohne LK"}
                        {kandidatMarken(k).map((mk) => (
                          <span key={mk.text} className={`marke-klein ${mk.ton}`}>{mk.text}</span>
                        ))}
                      </small>
                    </div>
                    <AktionsKnopf
                      label={k.eingeladen ? "Eingeladen" : "Einladen"}
                      gesperrt={k.eingeladen}
                      aktion={einladen.bind(null, k.member_id)}
                    />
                  </li>
                ))}
              </ul>
            )}
            {!suche && kandidatenAlle.length > OHNE_SUCHE && (
              <p className="beschreibung">Weitere findest du über die Suche.</p>
            )}
          </section>
        )}
      </MannschaftRahmen>
    </KontoUnterseite>
  );
}
