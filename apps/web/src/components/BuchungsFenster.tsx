"use client";

import { useEffect, useRef, useState } from "react";
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
  /** Nur im Buchen-Modus: die in dieser Stunde noch freien Startzeiten. */
  startzeiten: number[];
  rasterMinuten: number;
  anzeigeMinuten: number;
  istAdmin: boolean;
  laeuft: boolean;
  onBuchen: (fd: FormData) => void;
  onSpeichern: (bookingId: string, mitgliedIds: string[], gaeste: string[]) => void;
  onStornieren: (bookingId: string) => void;
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

  const gewaehlt = props.arten.find((a) => a.code === art);
  const maxWeitere = Math.max((gewaehlt?.max_players ?? 2) - 1, 0);
  const anzahl = mitglieder.length + gaeste.length;

  const [j, mo, t] = props.datum.split("-").map(Number);
  const startZeitpunkt = new Date(j!, (mo ?? 1) - 1, t, Math.floor(start / 60), start % 60, 0, 0);

  const pflichtVerletzt = Boolean(gewaehlt?.requires_partner) && anzahl === 0;

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
          verzeichnis={props.verzeichnis}
          mitglieder={mitglieder}
          gaeste={gaeste}
          maxWeitere={maxWeitere}
          pflicht={Boolean(gewaehlt?.requires_partner)}
          onMitglieder={setMitglieder}
          onGaeste={setGaeste}
        />

        <div className="fenster-fuss">
          <button className="knopf" disabled={props.laeuft || pflichtVerletzt}>
            {props.laeuft ? "Wird gebucht…" : `Verbindlich für ${alsUhrzeit(start)} buchen`}
          </button>
          <button type="button" className="knopf leise" onClick={props.onSchliessen}>
            Abbrechen
          </button>
        </div>
      </form>
    </>
  );
}

function VerwaltenInhalt(props: Props & { fenster: Extract<Fenster, { modus: "verwalten" }> }) {
  const b = props.fenster.belegung;
  const platz = props.plaetze.find((p) => p.id === b.court_id);

  const [mitglieder, setMitglieder] = useState<string[]>(b.player_member_ids ?? []);
  const [gaeste, setGaeste] = useState<string[]>(b.guest_names ?? []);
  const [stornoOffen, setStornoOffen] = useState(false);

  const art = props.arten.find((a) => a.code === b.type_code);
  const maxWeitere = Math.max((art?.max_players ?? 4) - 1, 0);
  const laeuftSchon = new Date(b.starts_at).getTime() < Date.now();

  // Eine Blockung hat keine Mitspieler - dort bleibt nur das Aufheben.
  const nurStorno = b.kind === "blocking";
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

        {!nurStorno && (
          <Mitspielersuche
            verzeichnis={props.verzeichnis.filter((m) => m.id !== eigentuemerId(b, props.verzeichnis))}
            mitglieder={mitglieder}
            gaeste={gaeste}
            maxWeitere={maxWeitere}
            pflicht={Boolean(art?.requires_partner)}
            onMitglieder={setMitglieder}
            onGaeste={setGaeste}
          />
        )}

        <div className="fenster-fuss">
          {!nurStorno && (
            <button
              type="button"
              className="knopf"
              disabled={props.laeuft || !geaendert}
              onClick={() => props.onSpeichern(b.booking_id, mitglieder, gaeste)}
            >
              {props.laeuft ? "Wird gespeichert…" : "Mitspieler speichern"}
            </button>
          )}

          {stornoOffen ? (
            <button
              type="button"
              className="knopf gefahr"
              disabled={props.laeuft}
              onClick={() => props.onStornieren(b.booking_id)}
            >
              Wirklich stornieren
            </button>
          ) : (
            <button
              type="button"
              className="knopf leise"
              disabled={props.laeuft}
              onClick={() => setStornoOffen(true)}
            >
              Buchung stornieren
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

/**
 * Der Bucher darf nicht zusaetzlich als Mitspieler auftauchen - die Datenbank
 * weist das ab. Sein Name steht im Kopf, die Id kennen wir nur ueber das
 * Verzeichnis.
 */
function eigentuemerId(b: { owner_name: string | null }, verzeichnis: Mitglied[]): string | undefined {
  if (!b.owner_name) return undefined;
  return verzeichnis.find((m) => `${m.first_name} ${m.last_name}` === b.owner_name)?.id;
}
