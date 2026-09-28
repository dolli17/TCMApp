"use client";

import { useEffect, useId, useRef, useState } from "react";
import { berlinTime } from "@tcm/core";
import {
  alsUhrzeit, lokaleMinuten,
  type Buchungsart, type Fenster, type Mitglied, type Platz,
} from "@/components/Belegungsplan";
import { initialen, Mitspielersuche } from "@/components/Mitspielersuche";

interface Props {
  fenster: Fenster;
  datum: string;
  plaetze: Platz[];
  arten: Buchungsart[];
  verzeichnis: Mitglied[];
  /** Eigene Mitglieds-Id, damit man sich nicht selbst als Mitspieler waehlt. */
  meineId: string | null;
  /** Nur im Buchen-Modus: die in diesem Anzeigeblock noch freien Startzeiten. */
  startzeiten: number[];
  rasterMinuten: number;
  anzeigeMinuten: number;
  /** Gastgebuehr je Gast in Cent. */
  gastgebuehrCents: number;
  istAdmin: boolean;
  laeuft: boolean;
  /** Rueckmeldung der Datenbank, steht ueber dem Hauptknopf. */
  fehler: string | null;
  onBuchen: (fd: FormData) => void;
  onSpeichern: (bookingId: string, mitgliedIds: string[], gaeste: string[]) => void;
  onStornieren: (bookingId: string, grund?: string) => void;
  onTerminAbsagen: (bookingId: string, grund?: string) => void;
  /** Gibt die Zahl der Kollisionen zurueck, wenn ohne Verdraengen abgebrochen wurde. */
  onSperren: (
    courtId: string, minute: number, grund: string, verdraengen: boolean,
  ) => Promise<number | null>;
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

  // Wer Mitspieler sucht, darf unterbesetzt buchen - genau dafuer ist der
  // Schalter da. Die Datenbank sieht das ebenso.
  const pflichtVerletzt =
    Boolean(gewaehlt?.requires_partner) && anzahl === 0 && !sucheMitspieler;

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
          <button className="knopf gold gross block" disabled={props.laeuft || pflichtVerletzt}>
            {props.laeuft ? "Wird gebucht…" : `${platz?.name ?? "Platz"} buchen`}
          </button>
          <p className="fussnote">
            {pflichtVerletzt
              ? `${gewaehlt?.name ?? "Diese Spielform"} braucht einen Mitspieler – oder schalte „Mitspieler gesucht“ ein.`
              : "Stornieren geht bis Spielbeginn"}
          </p>
        </div>
      </form>

      {/* Sperren steht ausserhalb des Formulars: es ist keine Buchung, und ein
          Knopf darin wuerde beim Enter im Suchfeld mitfeuern. */}
      {props.istAdmin && (
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
                <span>Grund der Sperrung</span>
                <input
                  type="text"
                  value={sperrgrund}
                  placeholder="z. B. Platzpflege nach Regen"
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
                  disabled={props.laeuft || sperrgrund.trim() === ""}
                  onClick={async () => {
                    const offen = await props.onSperren(
                      props.fenster.courtId,
                      stunde,
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
  const [grund, setGrund] = useState("");

  const art = props.arten.find((a) => a.code === b.type_code);
  const maxWeitere = Math.max((art?.max_players ?? 4) - 1, 0);
  const laeuftSchon = new Date(b.starts_at).getTime() < Date.now();

  // Eine Blockung hat keine Mitspieler - dort bleibt nur das Aufheben.
  const nurStorno = b.kind === "blocking";

  // Drei Rollen an demselben Fenster: der Bucher verwaltet, ein Admin
  // verwaltet fremd, und wer nur eingeladen ist, kann ausschliesslich
  // mitspielen. Ohne diese Trennung koennte ein Fremder ueber die
  // Mitspielersuche die Besetzung des Buchers umwerfen.
  const darfVerwalten = b.is_own || props.istAdmin;
  const kannMitspielen = !b.is_own && !b.bin_dabei && b.partner_wanted && b.frei > 0;

  // Ein Serientermin faellt aus, eine Blockung wird aufgehoben, eine fremde
  // Buchung wird storniert - drei Vorgaenge mit drei verschiedenen Folgen. Nur
  // beim Storno einer fremden Buchung ist ein Grund Pflicht: dort sitzt jemand,
  // der eine Erklaerung verdient. Hinter einer Blockung sitzt niemand.
  const istSerientermin = b.series_id !== null;
  const grundNoetig = props.istAdmin && !b.is_own && b.kind === "booking";
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
              ? `Gesperrt · ${b.title?.trim() || "ohne Grund"}`
              : `${b.type_name} · gebucht von ${b.is_own ? "dir" : (b.owner_name ?? "unbekannt")}`}
        </p>

        {props.istAdmin && !b.is_own && (
          <p className="hinweis">Du bearbeitest eine fremde Buchung als Administrator.</p>
        )}
        {laeuftSchon && (
          <p className="hinweis">Die Spielzeit läuft bereits – Änderungen sind Admin-Sache.</p>
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

        {darfVerwalten && stornoOffen && (
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

        <div className="blatt-fuss">
          <Fehler text={props.fehler} />

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

          {!darfVerwalten ? null : stornoOffen ? (
            <button
              type="button"
              className="knopf gefahr block"
              disabled={props.laeuft || (grundNoetig && grund.trim() === "")}
              onClick={() =>
                istSerientermin
                  ? props.onTerminAbsagen(b.booking_id, grund)
                  : props.onStornieren(b.booking_id, grund)
              }
            >
              {istSerientermin ? "Termin wirklich absagen" : "Wirklich stornieren"}
            </button>
          ) : (
            <button
              type="button"
              className="knopf gefahr-leise block"
              disabled={props.laeuft}
              onClick={() => setStornoOffen(true)}
            >
              {istSerientermin
                ? "Fällt diese Woche aus"
                : nurStorno
                  ? "Sperrung aufheben"
                  : "Buchung stornieren"}
            </button>
          )}

          {b.is_own && !nurStorno && <p className="fussnote">Stornieren geht bis Spielbeginn</p>}
        </div>
      </div>
    </>
  );
}

// Der Bucher darf nicht zusaetzlich als Mitspieler auftauchen - die Datenbank
// weist das ab. Frueher wurde er ueber den Namen im Verzeichnis gesucht; bei
// zwei Mitgliedern gleichen Namens traf das den Falschen. day_schedule liefert
// seit 20260807100000 die Id mit.
