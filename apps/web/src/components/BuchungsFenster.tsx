"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  berlinTime, blockingLabel, bookingActions, bookingTypeInfo, checkPlayers, timeToMinutes, umsetzZiele,
} from "@tcm/core";
import type { AktionsErgebnis, TagesBelegung } from "@/app/plan/aktionen";
import {
  alsUhrzeit, lokaleMinuten,
  type Belegung, type Blockungsart, type Buchungsart, type Fenster, type Mitglied, type Platz,
} from "@/components/Belegungsplan";
import { initialen, Mitspielersuche } from "@/components/Mitspielersuche";
import { SperrGrund } from "@/components/SperrGrund";

interface Props {
  fenster: Fenster;
  datum: string;
  plaetze: Platz[];
  /** Belegung des Tages, der im Plan zu sehen ist - fuer die Ziele beim Umsetzen. */
  belegungen: Belegung[];
  arten: Buchungsart[];
  /** Kategorien einer Sperrung, die erste ist die Vorgabe. */
  blockungsarten: Blockungsart[];
  verzeichnis: Mitglied[];
  /** Eigene Mitglieds-Id, damit man sich nicht selbst als Mitspieler waehlt. */
  meineId: string | null;
  /** Jetzt, mit der Uhr des Plans - entscheidet, ob eine Buchung schon laeuft. */
  jetzt: Date;
  oeffnungMinuten: number;
  schlussMinuten: number;
  /** Nur im Buchen-Modus: die in diesem Anzeigeblock noch freien Startzeiten. */
  startzeiten: number[];
  rasterMinuten: number;
  anzeigeMinuten: number;
  /** Gastgebuehr je Gast in Cent. */
  gastgebuehrCents: number;
  /** Vorstand, App Admin oder Platzwart: sperren und fremde Buchungen verwalten. */
  darfPlaetze: boolean;
  laeuft: boolean;
  /** Rueckmeldung der Datenbank, steht ueber dem Hauptknopf. */
  fehler: string | null;
  onBuchen: (fd: FormData) => void;
  onSpeichern: (bookingId: string, mitgliedIds: string[], gaeste: string[]) => void;
  onStornieren: (bookingId: string, grund?: string) => void;
  onTerminAbsagen: (bookingId: string, grund?: string) => void;
  /** startsAt als ISO-Zeitstempel, schon in Berliner Zeit gebildet. */
  onUmsetzen: (bookingId: string, courtId: string, startsAt: string, grund?: string) => void;
  /** Belegung eines anderen Tages, fuer das Umsetzen dorthin. */
  onTagLaden: (tag: string) => Promise<AktionsErgebnis & { belegung?: TagesBelegung[] }>;
  /** Gibt die Zahl der Kollisionen zurueck, wenn ohne Verdraengen abgebrochen wurde. */
  onSperren: (
    courtId: string, minute: number, typCode: string, grund: string, verdraengen: boolean,
  ) => Promise<number | null>;
  /** Wie onSperren, fuer eine bestehende Sperrung. Minuten am Tag des Plans. */
  onSperreAendern: (
    bookingId: string, platzIds: string[], von: number, bis: number, typCode: string, grund: string,
    verdraengen: boolean,
  ) => Promise<number | null>;
  onSperreAufheben: (bookingId: string) => void;
  onAusschreiben: (bookingId: string, gesucht: boolean) => void;
  onBeitreten: (bookingId: string) => void;
  onSchliessen: () => void;
}

const TAG = new Intl.DateTimeFormat("de-DE", {
  weekday: "long", day: "2-digit", month: "2-digit", timeZone: "UTC",
});
/** "Montag, 28.09." - der Tag kommt als JJJJ-MM-TT und wird mittags gelesen. */
const tagText = (tag: string) => TAG.format(new Date(`${tag}T12:00:00Z`));

/**
 * Das Buchungsblatt (docs/design/clubhaus, Abschnitt 4 - im Web weiter als
 * <dialog class="fenster">): dieselben Felder in derselben Reihenfolge wie
 * das Blatt der App. Am Telefon faehrt es von unten herein, ab 768 px steht
 * es in der Mitte.
 *
 * Das native <dialog>-Element statt einer nachgebauten Overlay-Loesung: es
 * bringt Fokusfalle, Escape zum Schliessen und Inertheit des Hintergrunds
 * mit - drei Dinge, die von Hand regelmaessig schieflaufen.
 */
export function BuchungsFenster(props: Props) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="fenster blatt"
      onClose={props.onSchliessen}
      onCancel={props.onSchliessen}
      onClick={(e) => {
        // Klick auf die Flaeche neben dem Fenster schliesst es. Das Ziel ist
        // nur dann der Dialog selbst, wenn wirklich daneben geklickt wurde.
        if (e.target === dialog.current) dialog.current?.close();
      }}
      aria-label={props.fenster.modus === "buchen" ? "Platz buchen" : "Buchung verwalten"}
    >
      <div className="griff" aria-hidden="true" />
      {props.fenster.modus === "buchen" ? (
        <BuchenInhalt {...props} fenster={props.fenster} />
      ) : (
        <VerwaltenInhalt {...props} fenster={props.fenster} />
      )}
    </dialog>
  );
}

function Kopf({ kicker, titel, onSchliessen }: {
  kicker: string; titel: string; onSchliessen: () => void;
}) {
  return (
    <div className="fenster-kopf">
      <div>
        <p className="kicker">{kicker}</p>
        <h2 className="tnum">{titel}</h2>
      </div>
      <button type="button" className="fenster-zu" onClick={onSchliessen} aria-label="Schließen">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

/** Fehler der Datenbank - ueber dem Hauptknopf, damit man ihn beim Klicken sieht. */
function Fehler({ text }: { text: string | null }) {
  if (!text) return null;
  return <div className="hinweis fehler" role="alert">{text}</div>;
}

/** "Mitspieler gesucht" als Schalter mit Erklaerung - ohne sie raet man, was das bewirkt. */
function GesuchtKarte({ an, onWechsel, deaktiviert }: {
  an: boolean; onWechsel: (an: boolean) => void; deaktiviert?: boolean;
}) {
  return (
    <label className="gesucht-karte">
      <span>
        <b>Mitspieler gesucht</b>
        <small>Dein Spiel erscheint unter „Offene Spiele“. Wer mag, trägt sich selbst ein.</small>
      </span>
      <input
        type="checkbox"
        role="switch"
        className="schalter-feld"
        checked={an}
        disabled={deaktiviert}
        onChange={(e) => onWechsel(e.target.checked)}
      />
    </label>
  );
}

function BuchenInhalt(props: Props & { fenster: Extract<Fenster, { modus: "buchen" }> }) {
  const platz = props.plaetze.find((p) => p.id === props.fenster.courtId);
  const stunde = props.fenster.stunde;
  const kennung = useId();

  // Halbe Stunden desselben Blocks, damit belegte Haelften sichtbar bleiben
  // statt einfach zu fehlen.
  const haelften: number[] = [];
  for (let m = stunde; m < stunde + props.anzeigeMinuten; m += props.rasterMinuten) haelften.push(m);

  const [start, setStart] = useState(
    props.startzeiten.includes(props.fenster.start) ? props.fenster.start : (props.startzeiten[0] ?? stunde),
  );
  const [art, setArt] = useState(props.arten[0]?.code ?? "einzel");
  const [mitglieder, setMitglieder] = useState<string[]>([]);
  const [gaeste, setGaeste] = useState<string[]>([]);
  const [sucheMitspieler, setSucheMitspieler] = useState(false);
  const [sperrgrund, setSperrgrund] = useState<string | null>(null);
  // Vorgabe bleibt die Platzpflege, wie vor der Kategoriewahl; sonst die erste.
  const [sperrart, setSperrart] = useState(
    props.blockungsarten.find((a) => a.code === "platzpflege")?.code ?? props.blockungsarten[0]?.code ?? "platzpflege",
  );
  const [sperrKollisionen, setSperrKollisionen] = useState<number | null>(null);

  const gewaehlt = props.arten.find((a) => a.code === art);
  const dauer = gewaehlt?.duration_minutes ?? 60;
  const maxWeitere = Math.max((gewaehlt?.max_players ?? 2) - 1, 0);
  const anzahl = mitglieder.length + gaeste.length;
  const nochPlatz = anzahl < maxWeitere;
  const ich = props.verzeichnis.find((m) => m.id === props.meineId);

  // Ueber berlinTime, nicht ueber new Date(...): der Konstruktor rechnet in
  // der Zeitzone des Geraets. Ein Rechner, der auf London steht, haette hier
  // eine um eine Stunde verschobene Startzeit an die Datenbank geschickt.
  const startZeitpunkt = berlinTime(props.datum, start);

  // Dieselbe Besetzungsregel wie create_booking: ein Doppel braucht drei
  // Spieler, wer Mitspieler sucht, darf unterbesetzt buchen - genau dafuer ist
  // der Schalter da.
  const besetzung = gewaehlt
    ? checkPlayers(bookingTypeInfo(gewaehlt), mitglieder.length, gaeste.length, sucheMitspieler && nochPlatz)
    : null;
  const besetzungFehlt = besetzung !== null && !besetzung.ok ? besetzung.reason : null;

  function spielformWechseln(neu: string) {
    setArt(neu);
    // Wer von Doppel auf Einzel wechselt, hat womoeglich zu viele Leute
    // eingetragen; die ueberzaehligen fallen hinten weg.
    const max = Math.max((props.arten.find((a) => a.code === neu)?.max_players ?? 2) - 1, 0);
    const m = mitglieder.slice(0, max);
    setMitglieder(m);
    setGaeste(gaeste.slice(0, Math.max(0, max - m.length)));
  }

  return (
    <>
      <Kopf
        kicker={`${platz?.name ?? "Platz"} · ${tagText(props.datum)}`}
        titel={`${alsUhrzeit(start)} – ${alsUhrzeit(start + dauer)}`}
        onSchliessen={props.onSchliessen}
      />

      <form action={props.onBuchen} className="fenster-inhalt">
        <input type="hidden" name="courtId" value={props.fenster.courtId} />
        <input type="hidden" name="startsAt" value={startZeitpunkt.toISOString()} />
        {mitglieder.map((id) => <input key={id} type="hidden" name="mitspieler" value={id} />)}
        {gaeste.map((g, i) => <input key={`g${i}`} type="hidden" name="gast" value={g} />)}
        {sucheMitspieler && nochPlatz && (
          <input type="hidden" name="partnerWanted" value="1" />
        )}

        <div className={haelften.length <= 2 && props.arten.length <= 2 ? "segment-paar" : "segment-stapel"}>
          <fieldset className="segmente startwahl">
            <legend>Beginn</legend>
            <div className="segment-leiste">
              {haelften.map((m) => {
                const frei = props.startzeiten.includes(m);
                return (
                  <label key={m} className="segment" title={frei ? undefined : "Zu dieser Zeit ist der Platz nicht mehr frei"}>
                    <input
                      type="radio"
                      name={`${kennung}-beginn`}
                      value={m}
                      checked={start === m}
                      disabled={!frei}
                      onChange={() => setStart(m)}
                    />
                    <span className="tnum">{alsUhrzeit(m)}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="segmente">
            <legend>Spielform</legend>
            <div className="segment-leiste">
              {props.arten.map((a) => (
                <label key={a.code} className="segment">
                  <input
                    type="radio"
                    name="bookingType"
                    value={a.code}
                    checked={art === a.code}
                    onChange={() => spielformWechseln(a.code)}
                  />
                  <span>{a.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        {/* Sich selbst mitzunehmen weist die Datenbank ab - der Bucher zaehlt
            ohnehin mit. */}
        <Mitspielersuche
          kopf={{ initialen: initialen(ich?.first_name, ich?.last_name), name: "Du", gelb: true }}
          verzeichnis={props.verzeichnis.filter((m) => m.id !== props.meineId)}
          mitglieder={mitglieder}
          gaeste={gaeste}
          maxWeitere={maxWeitere}
          pflicht={Boolean(gewaehlt?.requires_partner) && !sucheMitspieler}
          gastgebuehrCents={props.gastgebuehrCents}
          onMitglieder={setMitglieder}
          onGaeste={setGaeste}
        />

        {nochPlatz && <GesuchtKarte an={sucheMitspieler} onWechsel={setSucheMitspieler} />}

        <div className="blatt-fuss">
          <Fehler text={props.fehler} />
          <button className="knopf gold gross block" disabled={props.laeuft || besetzungFehlt !== null}>
            {props.laeuft ? "Wird gebucht…" : `${platz?.name ?? "Platz"} buchen`}
          </button>
          <p className="fussnote">
            {besetzungFehlt
              ? `${besetzungFehlt}${nochPlatz ? " Oder schalte „Mitspieler gesucht“ ein." : ""}`
              : "Stornieren geht bis Spielbeginn"}
          </p>
        </div>
      </form>

      {/* Sperren steht ausserhalb des Formulars: es ist keine Buchung, und ein
          Knopf darin wuerde beim Enter im Suchfeld mitfeuern. */}
      {props.darfPlaetze && (
        <div className="fenster-inhalt sperrbereich">
          {sperrgrund === null ? (
            <button
              type="button"
              className="knopf leise klein"
              onClick={() => setSperrgrund("")}
            >
              Stattdessen sperren
            </button>
          ) : (
            <>
              <label>
                <span>Kategorie</span>
                <select
                  value={sperrart}
                  onChange={(e) => {
                    setSperrart(e.target.value);
                    setSperrKollisionen(null);
                  }}
                >
                  {props.blockungsarten.map((a) => (
                    <option key={a.code} value={a.code}>{a.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Grund (freiwillig)</span>
                <input
                  type="text"
                  value={sperrgrund}
                  placeholder="z. B. nach Regen"
                  onChange={(e) => setSperrgrund(e.target.value)}
                />
              </label>
              <p className="mit">
                Gesperrt wird {alsUhrzeit(stunde)}–{alsUhrzeit(stunde + props.anzeigeMinuten)} Uhr
                auf {platz?.name ?? "diesem Platz"}.
              </p>
              <div className="fenster-fuss">
                <button
                  type="button"
                  className={sperrKollisionen === null ? "knopf leise" : "knopf gefahr"}
                  disabled={props.laeuft}
                  onClick={async () => {
                    const offen = await props.onSperren(
                      props.fenster.courtId,
                      stunde,
                      sperrart,
                      sperrgrund,
                      sperrKollisionen !== null,
                    );
                    setSperrKollisionen(offen);
                  }}
                >
                  {sperrKollisionen === null
                    ? "Sperren"
                    : `${sperrKollisionen} ${
                        sperrKollisionen === 1 ? "Buchung" : "Buchungen"
                      } verdrängen`}
                </button>
                <button
                  type="button"
                  className="knopf leise"
                  onClick={() => {
                    setSperrgrund(null);
                    setSperrKollisionen(null);
                  }}
                >
                  Doch nicht
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

function VerwaltenInhalt(props: Props & { fenster: Extract<Fenster, { modus: "verwalten" }> }) {
  const b = props.fenster.belegung;
  const platz = props.plaetze.find((p) => p.id === b.court_id);

  const [mitglieder, setMitglieder] = useState<string[]>(b.player_member_ids ?? []);
  const [gaeste, setGaeste] = useState<string[]>(b.guest_names ?? []);
  const [stornoOffen, setStornoOffen] = useState(false);
  const [umsetzOffen, setUmsetzOffen] = useState(false);
  const [bearbeitenOffen, setBearbeitenOffen] = useState(false);
  const [grund, setGrund] = useState("");

  const art = props.arten.find((a) => a.code === b.type_code);
  const maxWeitere = Math.max((art?.max_players ?? 4) - 1, 0);
  const laeuftSchon = new Date(b.starts_at).getTime() <= props.jetzt.getTime();

  // Eine Blockung hat keine Mitspieler - dort bleibt nur das Aufheben.
  const nurStorno = b.kind === "blocking";

  // Drei Rollen an demselben Fenster: der Bucher verwaltet, wer
  // Platzrechte hat, verwaltet fremd, und wer nur eingeladen ist, kann ausschliesslich
  // mitspielen. Ohne diese Trennung koennte ein Fremder ueber die
  // Mitspielersuche die Besetzung des Buchers umwerfen. Ab Spielbeginn
  // bleibt nur, wer Platzrechte hat - so eng wie die RPCs (bookingActions).
  const darf = bookingActions({
    startsAt: b.starts_at,
    own: b.is_own,
    joined: b.bin_dabei,
    partnerWanted: b.partner_wanted,
    free: b.frei,
    managesCourts: props.darfPlaetze,
    now: props.jetzt,
  });
  const darfVerwalten = darf.cancel;
  const kannMitspielen = darf.join;

  // Ein Serientermin faellt aus, eine Blockung wird aufgehoben, eine fremde
  // Buchung wird storniert - drei Vorgaenge mit drei verschiedenen Folgen. Nur
  // beim Storno einer fremden Buchung ist ein Grund Pflicht: dort sitzt jemand,
  // der eine Erklaerung verdient. Hinter einer Blockung sitzt niemand.
  const istSerientermin = b.series_id !== null;
  // Umsetzen nur fuer normale Buchungen, die noch nicht vorbei sind - so
  // eng wie move_booking. Sperrungen und Serientermine haben eigene Wege.
  const kannUmsetzen =
    props.darfPlaetze && b.kind === "booking" && !istSerientermin &&
    new Date(b.ends_at).getTime() > props.jetzt.getTime();
  const grundNoetig = props.darfPlaetze && !b.is_own && b.kind === "booking";
  // Eine Sperrung aendert, wer sperren darf (update_blocking). Serientermine
  // gehoeren zur Serie und werden dort geaendert.
  const kannSperreAendern = props.darfPlaetze && nurStorno && !istSerientermin;
  const sperre = blockingLabel(b);
  const geaendert =
    JSON.stringify([...mitglieder].sort()) !== JSON.stringify([...(b.player_member_ids ?? [])].sort()) ||
    JSON.stringify([...gaeste].sort()) !== JSON.stringify([...(b.guest_names ?? [])].sort());

  const [vorname, ...rest] = (b.owner_name ?? "").split(" ");
  const bucher = {
    initialen: initialen(vorname, rest.at(-1)),
    name: b.is_own ? "Du" : (b.owner_name ?? "Bucher"),
    gelb: b.is_own,
  };

  return (
    <>
      <Kopf
        kicker={`${platz?.name ?? "Platz"} · ${tagText(props.datum)}`}
        titel={`${alsUhrzeit(lokaleMinuten(b.starts_at))} – ${alsUhrzeit(lokaleMinuten(b.ends_at))}`}
        onSchliessen={props.onSchliessen}
      />

      <div className="fenster-inhalt">
        <p className="blatt-unterzeile">
          {istSerientermin
            ? `${b.title ?? b.type_name} · Serientermin`
            : nurStorno
              ? `Gesperrt · ${sperre.kategorie}`
              : `${b.type_name} · gebucht von ${b.is_own ? "dir" : (b.owner_name ?? "unbekannt")}`}
        </p>
        {nurStorno && !istSerientermin && sperre.grund && <p className="mit">{sperre.grund}</p>}

        {props.darfPlaetze && !b.is_own && !nurStorno && (
          <p className="hinweis">Du bearbeitest eine fremde Buchung mit Platzrechten.</p>
        )}
        {laeuftSchon && (
          <p className="hinweis">Die Spielzeit läuft bereits – Änderungen nur mit Platzrechten.</p>
        )}

        {b.partner_wanted && b.frei > 0 && (
          <p className="gesucht-text">
            Hier {b.frei === 1 ? "wird noch ein Mitspieler" : `werden noch ${b.frei} Mitspieler`} gesucht.
          </p>
        )}

        {!nurStorno && darfVerwalten && (
          <Mitspielersuche
            kopf={bucher}
            verzeichnis={props.verzeichnis.filter((m) => m.id !== b.owner_member_id)}
            mitglieder={mitglieder}
            gaeste={gaeste}
            maxWeitere={maxWeitere}
            pflicht={Boolean(art?.requires_partner) && !b.partner_wanted}
            gastgebuehrCents={props.gastgebuehrCents}
            onMitglieder={setMitglieder}
            onGaeste={setGaeste}
          />
        )}

        {!nurStorno && !darfVerwalten && (
          <div className="mitspieler">
            <p className="feldname">Wer spielt mit?</p>
            <div className="chips">
              <span className="chip">
                <span className="avatar" aria-hidden="true">{bucher.initialen}</span>
                <span className="name">{bucher.name}</span>
              </span>
              {b.players.map((p, i) => {
                const [v, ...n] = p.split(" ");
                return (
                  <span key={`${p}${i}`} className="chip">
                    <span className="avatar" aria-hidden="true">{initialen(v, n.at(-1))}</span>
                    <span className="name">{p}</span>
                  </span>
                );
              })}
              {Array.from({ length: b.frei }, (_, i) => (
                <span key={`frei${i}`} className="chip leer">
                  <span className="avatar" aria-hidden="true" />
                  <span className="name">frei</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {!nurStorno && darfVerwalten && (b.frei > 0 || b.partner_wanted) && (
          <GesuchtKarte
            an={b.partner_wanted}
            deaktiviert={props.laeuft}
            onWechsel={(an) => props.onAusschreiben(b.booking_id, an)}
          />
        )}

        {bearbeitenOffen && kannSperreAendern && (
          <SperreBearbeiten {...props} sperre={b} onZu={() => setBearbeitenOffen(false)} />
        )}

        {darfVerwalten && stornoOffen && !(nurStorno && !istSerientermin) && (
          <label>
            <span>Grund{grundNoetig ? "" : " (freiwillig)"}</span>
            <input
              type="text"
              value={grund}
              placeholder={
                istSerientermin ? "z. B. Ferien" : "Steht in der Nachricht an die Betroffenen"
              }
              onChange={(e) => setGrund(e.target.value)}
            />
          </label>
        )}

        {!bearbeitenOffen && (
        <div className="blatt-fuss">
          {/* Beim Umsetzen steht der Fehler dort, wo geklickt wurde. */}
          <Fehler text={umsetzOffen ? null : props.fehler} />

          {kannSperreAendern && !stornoOffen && (
            <button
              type="button"
              className="knopf gold gross block"
              disabled={props.laeuft}
              onClick={() => setBearbeitenOffen(true)}
            >
              Sperrung bearbeiten
            </button>
          )}

          {kannMitspielen && (
            <button
              type="button"
              className="knopf gold gross block"
              disabled={props.laeuft}
              onClick={() => props.onBeitreten(b.booking_id)}
            >
              {props.laeuft ? "Wird eingetragen…" : "Mitspielen"}
            </button>
          )}

          {!nurStorno && darfVerwalten && (
            <button
              type="button"
              className="knopf gold gross block"
              disabled={props.laeuft || !geaendert}
              onClick={() => props.onSpeichern(b.booking_id, mitglieder, gaeste)}
            >
              {props.laeuft ? "Wird gespeichert…" : "Mitspieler speichern"}
            </button>
          )}
          {!nurStorno && darfVerwalten && !props.laeuft && (
            <SperrGrund grund={geaendert ? null : "Noch nichts geändert."} />
          )}

          {!darfVerwalten ? null : stornoOffen ? (
            <button
              type="button"
              className="knopf gefahr block"
              disabled={props.laeuft || (grundNoetig && grund.trim() === "")}
              onClick={() =>
                istSerientermin
                  ? props.onTerminAbsagen(b.booking_id, grund)
                  : nurStorno
                    ? props.onSperreAufheben(b.booking_id)
                    : props.onStornieren(b.booking_id, grund)
              }
            >
              {istSerientermin ? "Termin wirklich absagen" : nurStorno ? "Wirklich aufheben" : "Wirklich stornieren"}
            </button>
          ) : (
            <button
              type="button"
              className="knopf gefahr-leise block"
              disabled={props.laeuft}
              onClick={() => {
                setStornoOffen(true);
                setUmsetzOffen(false);
              }}
            >
              {istSerientermin
                ? "Fällt diese Woche aus"
                : nurStorno
                  ? "Sperrung aufheben"
                  : "Buchung stornieren"}
            </button>
          )}

          {b.is_own && !nurStorno && !laeuftSchon && <p className="fussnote">Stornieren geht bis Spielbeginn</p>}
        </div>
        )}
      </div>

      {/* Abgesetzt wie das Sperren: Umsetzen ist die Ausnahme, wenn ein Platz
          ausfaellt - nicht das, was man an einer Buchung gewoehnlich tut. */}
      {kannUmsetzen && (
        <div className="fenster-inhalt sperrbereich">
          {umsetzOffen ? (
            <UmsetzBereich {...props} belegung={b} onZu={() => setUmsetzOffen(false)} />
          ) : (
            <button
              type="button"
              className="knopf leise klein"
              onClick={() => {
                setUmsetzOffen(true);
                setStornoOffen(false);
              }}
            >
              Umsetzen
            </button>
          )}
        </div>
      )}
    </>
  );
}

/**
 * Zeit, Plaetze, Kategorie und Grund einer Sperrung - wie beim Sperren
 * zweistufig: liegen Buchungen im Weg, nennt der erste Versuch ihre Zahl,
 * und erst der zweite verdraengt sie. Der Tag bleibt der des Plans; ein Ende
 * nach Mitternacht steht als 24:00 da.
 */
function SperreBearbeiten(props: Props & { sperre: Belegung; onZu: () => void }) {
  const b = props.sperre;
  const anfangVon = lokaleMinuten(b.starts_at);
  const dauer = Math.round((new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60_000);
  const [plaetze, setPlaetze] = useState<string[]>([b.court_id]);
  const [von, setVon] = useState(alsUhrzeit(anfangVon));
  const [bis, setBis] = useState(alsUhrzeit(Math.min(anfangVon + dauer, 24 * 60 - 1)));
  const [art, setArt] = useState(b.type_code);
  const [grund, setGrund] = useState(b.title?.trim() ?? "");
  const [kollisionen, setKollisionen] = useState<number | null>(null);

  // Eine abgeschaltete Kategorie bleibt waehlbar, solange die Sperrung sie traegt.
  const arten = props.blockungsarten.some((a) => a.code === b.type_code)
    ? props.blockungsarten
    : [{ code: b.type_code, name: b.type_name }, ...props.blockungsarten];
  const vonMin = von ? timeToMinutes(von) : NaN;
  const bisMin = bis ? timeToMinutes(bis) : NaN;
  const zeitOk = Number.isFinite(vonMin) && Number.isFinite(bisMin) && bisMin > vonMin;

  function neu<T>(setzen: (w: T) => void) {
    return (w: T) => {
      setzen(w);
      setKollisionen(null);
    };
  }

  async function speichern(verdraengen: boolean) {
    setKollisionen(await props.onSperreAendern(b.booking_id, plaetze, vonMin, bisMin, art, grund, verdraengen));
  }

  return (
    <div className="sperre-bearbeiten">
      <fieldset className="chipwahl" style={{ ["--spalten" as string]: Math.min(props.plaetze.length, 8) }}>
        <legend>Plätze</legend>
        <div>
          {props.plaetze.map((p) => {
            const an = plaetze.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                className="dpl"
                aria-pressed={an}
                aria-label={p.name}
                onClick={() => neu(setPlaetze)(an ? plaetze.filter((x) => x !== p.id) : [...plaetze, p.id])}
              >
                {p.short_name.replace(/^P/, "")}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="tippfelder">
        <label className="tippfeld">
          <span>Von</span>
          <input type="time" step={props.rasterMinuten * 60} value={von} onChange={(e) => neu(setVon)(e.target.value)} />
        </label>
        <label className="tippfeld">
          <span>Bis</span>
          <input type="time" step={props.rasterMinuten * 60} value={bis} onChange={(e) => neu(setBis)(e.target.value)} />
        </label>
      </div>

      <label>
        <span>Kategorie</span>
        <select value={art} onChange={(e) => neu(setArt)(e.target.value)}>
          {arten.map((a) => (
            <option key={a.code} value={a.code}>{a.name}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Grund (freiwillig)</span>
        <input type="text" value={grund} placeholder="z. B. nach Regen" onChange={(e) => setGrund(e.target.value)} />
      </label>

      <div className="blatt-fuss">
        <Fehler text={props.fehler} />
        {!zeitOk && <p className="fussnote">Das Ende muss nach dem Beginn liegen.</p>}
        {kollisionen !== null && (
          <div className="folgen" role="status">
            <div>
              <b>
                {kollisionen} {kollisionen === 1 ? "Buchung liegt" : "Buchungen liegen"} im Weg.
              </b>{" "}
              {kollisionen === 1 ? "Sie wird" : "Sie werden"} abgesagt, die Mitglieder bekommen Bescheid.
            </div>
          </div>
        )}
        {kollisionen === null ? (
          <button
            type="button"
            className="knopf gold gross block"
            disabled={props.laeuft || plaetze.length === 0 || !zeitOk}
            onClick={() => void speichern(false)}
          >
            {props.laeuft ? "Wird gespeichert…" : "Änderungen speichern"}
          </button>
        ) : null}
        {kollisionen === null && !props.laeuft && (
          <SperrGrund
            grund={plaetze.length === 0 ? "Erst einen Platz wählen." : !zeitOk ? "Das Ende muss nach dem Beginn liegen." : null}
          />
        )}
        {kollisionen === null ? null : (
          <button type="button" className="knopf gefahr block" disabled={props.laeuft} onClick={() => void speichern(true)}>
            {kollisionen} {kollisionen === 1 ? "Buchung" : "Buchungen"} verdrängen
          </button>
        )}
        <button type="button" className="knopf leise block" onClick={props.onZu}>
          Doch nicht
        </button>
      </div>
    </div>
  );
}

const KURZTAG = new Intl.DateTimeFormat("de-DE", {
  weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC",
});
const berlinTag = (d: Date) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(d);

/**
 * Wohin mit der Buchung? Platz, Tag und Beginn.
 *
 * Was waehlbar ist, rechnet umsetzZiele (@tcm/core) aus der Belegung des
 * Zieltags; fuer einen anderen Tag als den im Plan wird day_schedule
 * nachgeladen. Eine laufende Buchung wechselt nur den Platz - dann gibt es
 * keinen Tag zu waehlen und als Beginn nur den, der schon gilt.
 */
function UmsetzBereich(props: Props & { belegung: Belegung; onZu: () => void }) {
  const b = props.belegung;
  const kennung = useId();
  const laeuftSchon = new Date(b.starts_at).getTime() <= props.jetzt.getTime();
  const heute = berlinTag(props.jetzt);

  const [tag, setTag] = useState(props.datum);
  const [andererTag, setAndererTag] = useState<{ tag: string; belegung: TagesBelegung[] } | null>(null);
  const [ladeFehler, setLadeFehler] = useState<string | null>(null);
  const [platzWahl, setPlatzWahl] = useState<string | null>(null);
  const [minuteWahl, setMinuteWahl] = useState<number | null>(null);
  const [grund, setGrund] = useState("");
  // Nur die letzte Anfrage zaehlt: wer schnell durch die Tage klickt, soll
  // nicht die Belegung von Mittwoch unter dem Donnerstag sehen.
  const angefragt = useRef(props.datum);

  async function tagWaehlen(neu: string) {
    setTag(neu);
    setLadeFehler(null);
    angefragt.current = neu;
    if (neu === props.datum || !neu) return;
    const r = await props.onTagLaden(neu);
    if (angefragt.current !== neu) return;
    if (r.ok) setAndererTag({ tag: neu, belegung: r.belegung ?? [] });
    else setLadeFehler(r.meldung);
  }

  const belegung: readonly TagesBelegung[] | null =
    tag === props.datum ? props.belegungen : andererTag?.tag === tag ? andererTag.belegung : null;

  const ziele = useMemo(
    () =>
      belegung
        ? umsetzZiele({
            booking: b,
            day: tag,
            courtIds: props.plaetze.map((p) => p.id),
            openingMinutes: props.oeffnungMinuten,
            closingMinutes: props.schlussMinuten,
            slotMinutes: props.rasterMinuten,
            occupied: belegung,
            now: props.jetzt,
          })
        : [],
    [b, belegung, tag, props.plaetze, props.oeffnungMinuten, props.schlussMinuten, props.rasterMinuten, props.jetzt],
  );

  // Die Wahl bleibt, solange sie noch ein Ziel ist; sonst rueckt die naechste
  // nach. Vorgewaehlt wird ein anderer Platz zur selben Zeit - der Regelfall,
  // wenn ein Platz unter Wasser steht.
  const mitZiel = props.plaetze.filter((p) => ziele.some((z) => z.courtId === p.id));
  const platz =
    mitZiel.find((p) => p.id === platzWahl) ??
    mitZiel.find((p) => p.id !== b.court_id) ??
    mitZiel[0];
  const zeiten = ziele.filter((z) => z.courtId === platz?.id).map((z) => z.minute);
  const eigeneMinute = lokaleMinuten(b.starts_at);
  const minute =
    minuteWahl !== null && zeiten.includes(minuteWahl)
      ? minuteWahl
      : zeiten.includes(eigeneMinute) ? eigeneMinute : (zeiten[0] ?? null);
  const dauer = lokaleMinuten(b.ends_at) - eigeneMinute;

  const grundNoetig = !b.is_own;
  const bereit = platz !== undefined && minute !== null && !(grundNoetig && grund.trim() === "");

  return (
    <>
      {laeuftSchon ? (
        <p className="mit">Die Buchung läuft schon – sie kann nur noch den Platz wechseln.</p>
      ) : (
        <label>
          <span>Tag</span>
          <input
            type="date"
            value={tag}
            min={heute}
            onChange={(e) => void tagWaehlen(e.target.value)}
          />
        </label>
      )}

      {ladeFehler ? (
        <div className="hinweis fehler" role="alert">{ladeFehler}</div>
      ) : belegung === null ? (
        <p className="mit">Belegung wird geladen…</p>
      ) : ziele.length === 0 ? (
        <p className="mit">An diesem Tag ist kein Platz frei, auf den die Buchung passt.</p>
      ) : (
        <>
          <fieldset className="segmente umsetz-plaetze">
            <legend>Platz</legend>
            <div className="segment-leiste">
              {props.plaetze.map((p) => {
                const frei = mitZiel.includes(p);
                return (
                  <label key={p.id} className="segment" title={frei ? p.name : `${p.name} ist zu keiner passenden Zeit frei`}>
                    <input
                      type="radio"
                      name={`${kennung}-platz`}
                      value={p.id}
                      checked={platz?.id === p.id}
                      disabled={!frei}
                      aria-label={p.name}
                      onChange={() => setPlatzWahl(p.id)}
                    />
                    <span>{p.short_name || p.name}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="segmente umsetz-zeiten">
            <legend>Beginn</legend>
            <div className="segment-leiste">
              {zeiten.map((m) => (
                <label key={m} className="segment">
                  <input
                    type="radio"
                    name={`${kennung}-beginn`}
                    value={m}
                    checked={minute === m}
                    onChange={() => setMinuteWahl(m)}
                  />
                  <span className="tnum">{alsUhrzeit(m)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}

      <label>
        <span>Grund{grundNoetig ? "" : " (freiwillig)"}</span>
        <input
          type="text"
          value={grund}
          placeholder="z. B. Platz 3 steht unter Wasser"
          onChange={(e) => setGrund(e.target.value)}
        />
      </label>

      {platz && minute !== null && (
        <p className="mit tnum">
          Neu: {platz.name} · {KURZTAG.format(new Date(`${tag}T12:00:00Z`))} ·{" "}
          {alsUhrzeit(minute)}–{alsUhrzeit(minute + dauer)} Uhr. Bucher und Mitspieler werden benachrichtigt.
        </p>
      )}

      <Fehler text={props.fehler} />
      <div className="fenster-fuss">
        <button
          type="button"
          className="knopf gold"
          disabled={props.laeuft || !bereit}
          onClick={() => {
            if (!platz || minute === null) return;
            props.onUmsetzen(b.booking_id, platz.id, berlinTime(tag, minute).toISOString(), grund);
          }}
        >
          {props.laeuft ? "Wird umgesetzt…" : "Hierhin umsetzen"}
        </button>
        {!props.laeuft && (
          <SperrGrund
            grund={
              platz === undefined || minute === null
                ? "Erst Platz und Uhrzeit wählen."
                : grundNoetig && grund.trim() === ""
                  ? "Erst einen Grund eingeben."
                  : null
            }
          />
        )}
        <button type="button" className="knopf leise" onClick={props.onZu}>
          Doch nicht
        </button>
      </div>
    </>
  );
}

// Der Bucher darf nicht zusaetzlich als Mitspieler auftauchen - die Datenbank
// weist das ab. Frueher wurde er ueber den Namen im Verzeichnis gesucht; bei
// zwei Mitgliedern gleichen Namens traf das den Falschen. day_schedule liefert
// seit 20260807100000 die Id mit.
