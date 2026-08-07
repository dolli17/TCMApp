"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { merkmalLoeschen, merkmalSpeichern } from "@/app/admin/mitglieder/merkmale/aktionen";

export interface MerkmalsDefinition {
  id: string;
  code: string;
  name: string;
  description: string;
  value_kind: string;
  multiple: boolean;
  self_editable: boolean;
  in_application: boolean;
  active: boolean;
  sort_order: number;
  optionen: { value: string; label: string }[];
  anzahl_werte: number;
}

const ARTEN = [
  { wert: "list", label: "Auswahl aus einer Liste" },
  { wert: "boolean", label: "Ja oder nein (Einwilligung)" },
  { wert: "text", label: "Freitext" },
  { wert: "date", label: "Datum" },
  { wert: "number", label: "Zahl" },
];

/**
 * Ein Merkmal anlegen oder ändern.
 *
 * Bewusst ein Formular je Merkmal statt einer Tabelle mit Inline-Bearbeitung:
 * ein Merkmal hat acht Eigenschaften und eine Werteliste, das passt in keine
 * Tabellenzeile. Vorbild ist das Serienformular.
 */
export function MerkmalsFormular({
  vorhanden,
  onFertig,
}: {
  vorhanden?: MerkmalsDefinition;
  onFertig?: () => void;
}) {
  const router = useRouter();
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, starte] = useTransition();
  const [art, setArt] = useState(vorhanden?.value_kind ?? "list");
  const [loeschenOffen, setLoeschenOffen] = useState(false);

  function abschicken(fd: FormData) {
    starte(async () => {
      const e = await merkmalSpeichern(fd);
      setMeldung({ ok: e.ok, text: e.meldung });
      if (e.ok && onFertig) onFertig();
    });
  }

  function loeschen() {
    if (!vorhanden) return;
    starte(async () => {
      const e = await merkmalLoeschen(vorhanden.code);
      if (e.ok) {
        router.push("/admin/einstellungen/merkmale");
        return;
      }
      setMeldung({ ok: false, text: e.meldung });
      setLoeschenOffen(false);
    });
  }

  const optionenText = (vorhanden?.optionen ?? [])
    .map((o) => (o.label && o.label !== o.value ? `${o.value} = ${o.label}` : o.value))
    .join("\n");

  return (
    <form action={abschicken} className="karte einstellungen">
      <h2 className="dpl">{vorhanden ? vorhanden.name : "Neues Merkmal"}</h2>

      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">
          {meldung.text}
        </div>
      )}

      <div className="formraster">
        <label>
          <span>Schlüssel</span>
          <input
            name="code"
            defaultValue={vorhanden?.code}
            readOnly={Boolean(vorhanden)}
            placeholder="z. B. fotoeinwilligung"
            pattern="[a-z0-9_]+"
            required
          />
          <span className="beschreibung">
            Kleinbuchstaben, Ziffern und Unterstriche. Bleibt unveränderlich.
          </span>
        </label>

        <label>
          <span>Name</span>
          <input name="name" defaultValue={vorhanden?.name} required />
        </label>

        <label>
          <span>Art</span>
          <select
            name="value_kind"
            value={art}
            onChange={(e) => setArt(e.target.value)}
            disabled={Boolean(vorhanden && vorhanden.anzahl_werte > 0)}
          >
            {ARTEN.map((a) => (
              <option key={a.wert} value={a.wert}>
                {a.label}
              </option>
            ))}
          </select>
          {vorhanden && vorhanden.anzahl_werte > 0 && (
            <span className="beschreibung">
              Nicht mehr änderbar: {vorhanden.anzahl_werte} Mitglieder haben einen Wert dazu.
            </span>
          )}
        </label>

        <label>
          <span>Reihenfolge</span>
          <input type="number" name="sort_order" defaultValue={vorhanden?.sort_order ?? 0} />
        </label>

        <label className="breit">
          <span>Wofür wird das gebraucht?</span>
          <input
            name="description"
            defaultValue={vorhanden?.description}
            required
            placeholder="Ein Satz zum Zweck – Pflichtangabe"
          />
          <span className="beschreibung">
            Bitte keine Angaben zu Gesundheit, Herkunft, Religion oder politischer Haltung
            erfassen. Solche Daten dürfen nur unter engen Voraussetzungen verarbeitet werden.
          </span>
        </label>

        {art === "list" && (
          <label className="breit">
            <span>Mögliche Werte</span>
            <textarea
              name="optionen"
              rows={5}
              defaultValue={optionenText}
              placeholder={"silberne_nadel = Silberne Ehrennadel\ngoldene_nadel = Goldene Ehrennadel"}
            />
            <span className="beschreibung">
              Eine Zeile je Wert. Optional mit Anzeigetext nach dem Gleichheitszeichen. Werte, die
              bereits jemandem zugeordnet sind, werden beim Entfernen stillgelegt statt gelöscht.
            </span>
          </label>
        )}
      </div>

      <label>
        <span>Einstellungen</span>
        <span className="beschreibung">
          <label style={{ display: "inline-flex", gap: 6, marginRight: 16, marginBottom: 0 }}>
            <input
              type="checkbox"
              name="multiple"
              defaultChecked={vorhanden?.multiple}
              style={{ width: "auto" }}
            />
            Mehrere Werte gleichzeitig
          </label>
          <label style={{ display: "inline-flex", gap: 6, marginRight: 16, marginBottom: 0 }}>
            <input
              type="checkbox"
              name="self_editable"
              defaultChecked={vorhanden?.self_editable}
              style={{ width: "auto" }}
            />
            Mitglied darf es selbst setzen
          </label>
          <label style={{ display: "inline-flex", gap: 6, marginRight: 16, marginBottom: 0 }}>
            <input
              type="checkbox"
              name="in_application"
              defaultChecked={vorhanden?.in_application}
              style={{ width: "auto" }}
            />
            Im Mitgliedsantrag abfragen
          </label>
          <label style={{ display: "inline-flex", gap: 6, marginBottom: 0 }}>
            <input
              type="checkbox"
              name="stillgelegt"
              defaultChecked={vorhanden ? !vorhanden.active : false}
              style={{ width: "auto" }}
            />
            Stillgelegt
          </label>
        </span>
      </label>

      <div className="detailkopf aktionen">
        <button className="knopf" disabled={laeuft}>
          {laeuft ? "Wird gespeichert…" : "Speichern"}
        </button>

        {vorhanden &&
          (vorhanden.anzahl_werte > 0 ? (
            <span className="beschreibung">
              Löschen nicht möglich: {vorhanden.anzahl_werte} Mitglieder haben einen Wert dazu.
              Stattdessen stilllegen.
            </span>
          ) : loeschenOffen ? (
            <>
              <button
                type="button"
                className="knopf leise"
                disabled={laeuft}
                onClick={() => setLoeschenOffen(false)}
              >
                Abbrechen
              </button>
              <button type="button" className="knopf gefahr" disabled={laeuft} onClick={loeschen}>
                Wirklich löschen
              </button>
            </>
          ) : (
            <button
              type="button"
              className="knopf leise"
              disabled={laeuft}
              onClick={() => setLoeschenOffen(true)}
            >
              Merkmal löschen
            </button>
          ))}
      </div>
    </form>
  );
}
