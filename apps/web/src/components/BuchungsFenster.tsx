"use client";

import { useEffect, useRef, useState } from "react";
import { berlinTime } from "@tcm/core";
import {
  alsUhrzeit, lokaleMinuten,
  type Buchungsart, type Fenster, type Mitglied, type Platz,
} from "@/components/Belegungsplan";
import { Mitspielersuche } from "@/components/Mitspielersuche";

interface Props {
  fenster: Fenster;
  datum: string;
  plaetze: Platz[];
  arten: Buchungsart[];
  verzeichnis: Mitglied[];
  /** Eigene Mitglieds-Id, damit man sich nicht selbst als Mitspieler waehlt. */
  meineId: string | null;
  /** Nur im Buchen-Modus: die in dieser Stunde noch freien Startzeiten. */
  startzeiten: number[];
  rasterMinuten: number;
  anzeigeMinuten: number;
  /** Gastgebuehr je Gast in Cent. 0 schaltet den Gast-Knopf ab. */
  gastgebuehrCents: number;
  istAdmin: boolean;
  laeuft: boolean;
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

/**
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
      className="fenster"
      onClose={props.onSchliessen}
      onCancel={props.onSchliessen}
      onClick={(e) => {
        // Klick auf die Flaeche neben dem Fenster schliesst es. Das Ziel ist
        // nur dann der Dialog selbst, wenn wirklich daneben geklickt wurde.
        if (e.target === dialog.current) dialog.current?.close();
      }}
      aria-label={props.fenster.modus === "buchen" ? "Platz buchen" : "Buchung verwalten"}
    >
      {props.fenster.modus === "buchen" ? (
        <BuchenInhalt {...props} fenster={props.fenster} />
      ) : (
        <VerwaltenInhalt {...props} fenster={props.fenster} />
      )}
    </dialog>
  );
}

function Kopf({ titel, unterzeile, onSchliessen }: {
  titel: string; unterzeile: string; onSchliessen: () => void;
}) {
  return (
    <div className="fenster-kopf">
      <div>
        <h2>{titel}</h2>
        <p>{unterzeile}</p>
      </div>
      <button type="button" className="fenster-zu" onClick={onSchliessen} aria-label="Schließen">
        ×
      </button>
    </div>
  );
}

function BuchenInhalt(props: Props & { fenster: Extract<Fenster, { modus: "buchen" }> }) {
  const platz = props.plaetze.find((p) => p.id === props.fenster.courtId);
  const stunde = props.fenster.stunde;

  // Halbe Stunden derselben Stunde, damit belegte Haelften sichtbar bleiben
  // statt einfach zu fehlen.
  const haelften: number[] = [];
  for (let m = stunde; m < stunde + props.anzeigeMinuten; m += props.rasterMinuten) haelften.push(m);

  const [start, setStart] = useState(props.startzeiten[0] ?? stunde);
  const [art, setArt] = useState(props.arten[0]?.code ?? "einzel");
  const [mitglieder, setMitglieder] = useState<string[]>([]);
  const [gaeste, setGaeste] = useState<string[]>([]);
  const [sucheMitspieler, setSucheMitspieler] = useState(false);
  const [sperrgrund, setSperrgrund] = useState<string | null>(null);
  const [sperrKollisionen, setSperrKollisionen] = useState<number | null>(null);

  const gewaehlt = props.arten.find((a) => a.code === art);
  const maxWeitere = Math.max((gewaehlt?.max_players ?? 2) - 1, 0);
  const anzahl = mitglieder.length + gaeste.length;
  const nochPlatz = anzahl < maxWeitere;

  // Ueber berlinTime, nicht ueber new Date(...): der Konstruktor rechnet in
  // der Zeitzone des Geraets. Ein Rechner, der auf London steht, haette hier
  // eine um eine Stunde verschobene Startzeit an die Datenbank geschickt.
  const startZeitpunkt = berlinTime(props.datum, start);

  // Wer Mitspieler sucht, darf unterbesetzt buchen - genau dafuer ist der
  // Schalter da. Die Datenbank sieht das ebenso.
  const pflichtVerletzt =
    Boolean(gewaehlt?.requires_partner) && anzahl === 0 && !sucheMitspieler;

  return (
    <>
      <Kopf
        titel={platz?.name ?? "Platz"}
        unterzeile={`${alsUhrzeit(stunde)}–${alsUhrzeit(stunde + props.anzeigeMinuten)} Uhr · ${
          gewaehlt?.duration_minutes ?? 60
        } Minuten Spielzeit`}
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

        <fieldset className="startwahl">
          <legend>Beginn</legend>
          {haelften.map((m) => {
            const frei = props.startzeiten.includes(m);
            return (
              <button
                key={m}
                type="button"
                className={`slotknopf ${start === m ? "aktiv" : ""}`}
                disabled={!frei}
                aria-pressed={start === m}
                title={frei ? undefined : "Zu dieser Zeit ist der Platz nicht mehr frei"}
                onClick={() => setStart(m)}
              >
                {alsUhrzeit(m)}
              </button>
            );
          })}
        </fieldset>

        <label>
          <span>Buchungsart</span>
          <select name="bookingType" value={art} onChange={(e) => setArt(e.target.value)}>
            {props.arten.map((a) => (
              <option key={a.code} value={a.code}>{a.name}</option>
            ))}
          </select>
        </label>

        <Mitspielersuche
          verzeichnis={props.verzeichnis.filter((m) => m.id !== props.meineId)}
          mitglieder={mitglieder}
          gaeste={gaeste}
          maxWeitere={maxWeitere}
          pflicht={Boolean(gewaehlt?.requires_partner) && !sucheMitspieler}
          gastgebuehrCents={props.gastgebuehrCents}
          onMitglieder={setMitglieder}
          onGaeste={setGaeste}
        />

        {nochPlatz && (
          <label className="schalter">
            <input
              type="checkbox"
              checked={sucheMitspieler}
              onChange={(e) => setSucheMitspieler(e.target.checked)}
            />
            <span>
              Mitspieler gesucht
              <small>
                Die Buchung erscheint unter „Offene Spiele“. Wer will, trägt sich selbst ein.
              </small>
            </span>
          </label>
        )}

        <div className="fenster-fuss">
          <button className="knopf" disabled={props.laeuft || pflichtVerletzt}>
            {props.laeuft ? "Wird gebucht…" : `Verbindlich für ${alsUhrzeit(start)} buchen`}
          </button>
          <button type="button" className="knopf leise" onClick={props.onSchliessen}>
            Abbrechen
          </button>
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
                  className={sperrKollisionen === null ? "knopf" : "knopf gefahr"}
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

  return (
    <>
      <Kopf
        titel={`${platz?.name ?? "Platz"}, ${alsUhrzeit(lokaleMinuten(b.starts_at))}–${alsUhrzeit(
          lokaleMinuten(b.ends_at),
        )}`}
        unterzeile={
          nurStorno
            ? `${b.title ?? b.type_name} · Blockung`
            : `${b.type_name} · gebucht von ${b.owner_name ?? "unbekannt"}`
        }
        onSchliessen={props.onSchliessen}
      />

      <div className="fenster-inhalt">
        {props.istAdmin && !b.is_own && (
          <p className="hinweis">Du bearbeitest eine fremde Buchung als Administrator.</p>
        )}
        {laeuftSchon && (
          <p className="hinweis">Die Spielzeit läuft bereits – Änderungen sind Admin-Sache.</p>
        )}

        {b.partner_wanted && b.frei > 0 && (
          <p className="hinweis">
            Hier werden noch {b.frei === 1 ? "ein Mitspieler" : `${b.frei} Mitspieler`} gesucht.
          </p>
        )}

        {!nurStorno && darfVerwalten && (
          <Mitspielersuche
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

        {!darfVerwalten && b.players.length > 0 && (
          <p className="unterzeile">Dabei sind: {b.players.join(", ")}</p>
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

        <div className="fenster-fuss">
          {kannMitspielen && (
            <button
              type="button"
              className="knopf"
              disabled={props.laeuft}
              onClick={() => props.onBeitreten(b.booking_id)}
            >
              {props.laeuft ? "Wird eingetragen…" : "Mitspielen"}
            </button>
          )}

          {!nurStorno && darfVerwalten && (
            <button
              type="button"
              className="knopf"
              disabled={props.laeuft || !geaendert}
              onClick={() => props.onSpeichern(b.booking_id, mitglieder, gaeste)}
            >
              {props.laeuft ? "Wird gespeichert…" : "Mitspieler speichern"}
            </button>
          )}

          {!nurStorno && darfVerwalten && (b.frei > 0 || b.partner_wanted) && (
            <button
              type="button"
              className="knopf leise"
              disabled={props.laeuft}
              onClick={() => props.onAusschreiben(b.booking_id, !b.partner_wanted)}
            >
              {b.partner_wanted ? "Nicht mehr ausschreiben" : "Mitspieler suchen"}
            </button>
          )}

          {!darfVerwalten ? null : stornoOffen ? (
            <button
              type="button"
              className="knopf gefahr"
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
              className="knopf leise"
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

          <button type="button" className="knopf leise" onClick={props.onSchliessen}>
            Schließen
          </button>
        </div>
      </div>
    </>
  );
}

// Der Bucher darf nicht zusaetzlich als Mitspieler auftauchen - die Datenbank
// weist das ab. Frueher wurde er ueber den Namen im Verzeichnis gesucht; bei
// zwei Mitgliedern gleichen Namens traf das den Falschen. day_schedule liefert
// seit 20260807100000 die Id mit.
