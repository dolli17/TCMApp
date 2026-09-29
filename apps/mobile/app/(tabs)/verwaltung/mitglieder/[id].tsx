/**
 * Ein Mitglied (Nachbau von apps/web/src/app/admin/mitglieder/[id]/page.tsx)
 *
 * Ohne ?bereich= steht das Mitglied als Uebersicht, aufgebaut wie das eigene
 * Konto. Jede Zeile dort oeffnet denselben Bildschirm mit ?bereich=… - im
 * Stack also eine neue Seite mit Zurueck zur Uebersicht, wie ?teil= im Web.
 * Der Kopf eines Bereichs zeigt Name und Marken, damit man sieht, an wem
 * man gerade etwas aendert.
 */

import { useCallback, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { Stack, router, useFocusEffect, useLocalSearchParams, type Href } from "expo-router";
import { Bildschirm } from "@/components/Bildschirm";
import { Statusmarke } from "@/components/verwaltung/Liste";
import { Austritt } from "@/components/verwaltung/mitglieder/Austritt";
import { Bank } from "@/components/verwaltung/mitglieder/Bank";
import { Beitraege } from "@/components/verwaltung/mitglieder/Beitraege";
import { Forderungen, Protokoll } from "@/components/verwaltung/mitglieder/Lesebereiche";
import { Merkmale } from "@/components/verwaltung/mitglieder/Merkmale";
import { Mitgliedschaft } from "@/components/verwaltung/mitglieder/Mitgliedschaft";
import { MitgliedUebersicht } from "@/components/verwaltung/mitglieder/MitgliedUebersicht";
import { StammdatenBlock, type Feld } from "@/components/verwaltung/mitglieder/StammdatenBlock";
import { Zugang } from "@/components/verwaltung/mitglieder/Zugang";
import {
  ALT, ANREDE, BEREICHE, GESCHLECHT, SPIELRECHT, STATUS_TEXT, istBereich, type Bereich,
} from "@/components/verwaltung/mitglieder/optionen";
import { useLaden } from "@/lib/laden";
import { useTheme } from "@/lib/theme";
import { ladeMitglied, ladeMitgliedUebersicht, type MitgliedDaten } from "@/lib/verwaltung/mitglieder";

export default function MitgliedSeite() {
  const p = useLocalSearchParams<{ id: string; bereich?: string; teil?: string; abschnitt?: string }>();
  const gewuenscht = p.bereich ?? p.teil ?? (p.abschnitt ? (ALT[p.abschnitt] ?? p.abschnitt) : undefined);
  const bereich = istBereich(gewuenscht) ? gewuenscht : null;
  if (!p.id) return null;
  return bereich ? <BereichSeite id={p.id} bereich={bereich} /> : <Uebersicht id={p.id} />;
}

/** Nach der Rueckkehr aus einem Bereich neu laden - beim ersten Fokus nicht. */
function useNeuBeiFokus(erneutHolen: () => Promise<void>) {
  const holen = useRef(erneutHolen);
  holen.current = erneutHolen;
  const erstesMal = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (erstesMal.current) {
        erstesMal.current = false;
        return;
      }
      void holen.current();
    }, []),
  );
}

function Uebersicht({ id }: { id: string }) {
  const { farben } = useTheme();
  const zustand = useLaden(() => ladeMitgliedUebersicht(id));
  useNeuBeiFokus(zustand.erneutHolen);
  const d = zustand.daten;

  return (
    <>
      <Stack.Screen
        options={{
          title: d ? `${d.m.first_name} ${d.m.last_name}` : "Mitglied",
          headerRight: () => (
            <Pressable
              onPress={() => router.push(`/verwaltung/mitglieder/${id}?bereich=stammdaten` as Href)}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text style={{ fontSize: 16, fontFamily: "Barlow_600SemiBold", color: farben.blueInk }}>Bearbeiten</Text>
            </Pressable>
          ),
        }}
      />
      <Bildschirm
        laedt={zustand.laedt}
        aktualisiert={zustand.aktualisiert}
        onAktualisieren={zustand.neuLaden}
        fehler={zustand.fehler}
      >
        {d && <MitgliedUebersicht d={d} />}
      </Bildschirm>
    </>
  );
}

function BereichSeite({ id, bereich }: { id: string; bereich: Bereich }) {
  const zustand = useLaden(() => ladeMitglied(id));
  const d = zustand.daten;

  return (
    <>
      <Stack.Screen options={{ title: BEREICHE[bereich] }} />
      <Bildschirm
        laedt={zustand.laedt}
        aktualisiert={zustand.aktualisiert}
        onAktualisieren={zustand.neuLaden}
        fehler={zustand.fehler}
      >
        {d && (
          <>
            <BereichKopf d={d} />
            <BereichInhalt d={d} bereich={bereich} onGeaendert={zustand.erneutHolen} />
          </>
        )}
      </Bildschirm>
    </>
  );
}

/** Name und Marken bleiben sichtbar: wer hier etwas aendert, sieht, an wem. */
function BereichKopf({ d }: { d: MitgliedDaten }) {
  const { farben } = useTheme();
  const m = d.m;
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 22, fontFamily: "Barlow_800ExtraBold", color: farben.ink }}>
        {m.first_name} {m.last_name}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        <Statusmarke
          ton={m.status === "active" ? "gruen" : m.status === "archived" ? "rot" : "grau"}
          text={STATUS_TEXT[m.status] ?? m.status}
        />
        {d.laufend && <Statusmarke text={`Nr. ${d.laufend.number}`} />}
        {d.istAdmin && <Statusmarke ton="gelb" text="Administrator" />}
        {m.is_trainer && <Statusmarke ton="gelb" text="Trainer" />}
        {m.teams && (
          <Statusmarke
            ton={m.is_team_captain ? "gelb" : "grau"}
            text={`${m.teams.name}${m.is_team_captain ? " · Mannschaftsführer" : ""}`}
          />
        )}
      </View>
    </View>
  );
}

function BereichInhalt({
  d,
  bereich,
  onGeaendert,
}: {
  d: MitgliedDaten;
  bereich: Bereich;
  onGeaendert: () => Promise<void>;
}) {
  const id = d.m.id;
  switch (bereich) {
    case "stammdaten":
      return <Stammdaten d={d} onGeaendert={onGeaendert} />;
    case "mitgliedschaft":
      return <Mitgliedschaft d={d} onGeaendert={onGeaendert} />;
    case "beitraege":
      return <Beitraege mitgliedId={id} onGeaendert={onGeaendert} />;
    case "forderungen":
      return <Forderungen mitgliedId={id} />;
    case "bank":
      return <Bank mitgliedId={id} onGeaendert={onGeaendert} />;
    case "merkmale":
      return <Merkmale mitgliedId={id} onGeaendert={onGeaendert} />;
    case "zugang":
      return <Zugang mitgliedId={id} selbst={d.selbst} onGeaendert={onGeaendert} />;
    case "protokoll":
      return <Protokoll mitgliedId={id} />;
    case "austritt":
      return <Austritt d={d} onGeaendert={onGeaendert} />;
  }
}

const STAMMFELDER: Feld[] = [
  { name: "first_name", label: "Vorname", art: "text" },
  { name: "last_name", label: "Nachname", art: "text" },
  { name: "title", label: "Titel", art: "text" },
  { name: "salutation", label: "Anrede", art: "auswahl", optionen: ANREDE },
  { name: "gender", label: "Geschlecht", art: "auswahl", optionen: GESCHLECHT },
  { name: "birthday", label: "Geburtstag", art: "datum" },
  { name: "email", label: "E-Mail", art: "email" },
  { name: "phone", label: "Telefon", art: "tel" },
  { name: "mobile", label: "Mobil", art: "tel" },
  { name: "street", label: "Straße", art: "text" },
  { name: "postcode", label: "PLZ", art: "text" },
  { name: "city", label: "Ort", art: "text" },
  { name: "country_code", label: "Land", art: "text" },
];

const NOTFALLFELDER: Feld[] = [
  { name: "emergency_contact_name", label: "Name", art: "text" },
  { name: "emergency_contact_phone", label: "Telefon", art: "tel" },
  { name: "emergency_contact_relation", label: "Verhältnis", art: "text", hinweis: "z. B. Mutter, Ehepartner" },
];

const SPORTFELDER: Feld[] = [
  { name: "is_trainer", label: "Trainer", art: "schalter" },
  { name: "tennis_lk", label: "Leistungsklasse", art: "text", hinweis: "z. B. LK12.3" },
  { name: "nuliga_id", label: "nuLiga-Id", art: "text" },
  { name: "playing_right", label: "Spielberechtigung", art: "auswahl", optionen: SPIELRECHT },
  { name: "playing_right_since", label: "Berechtigt seit", art: "datum" },
  { name: "nationality_code", label: "Nationalität", art: "text", hinweis: "Zwei Buchstaben, z. B. DE" },
];

const INTERNFELDER: Feld[] = [{ name: "notes", label: "Notizen", art: "mehrzeilig" }];

function Stammdaten({ d, onGeaendert }: { d: MitgliedDaten; onGeaendert: () => Promise<void> }) {
  const quelle = d.m as unknown as Record<string, unknown>;
  const gemeinsam = { mitgliedId: d.m.id, quelle, onGespeichert: onGeaendert };
  return (
    <>
      <StammdatenBlock titel="Person und Kontakt" felder={STAMMFELDER} {...gemeinsam} />
      <StammdatenBlock
        titel="Notfallkontakt"
        text="Wen rufen wir an, wenn auf der Anlage etwas passiert? Bei Kindern die Erziehungsberechtigten."
        felder={NOTFALLFELDER}
        {...gemeinsam}
      />
      <StammdatenBlock
        titel="Sport"
        text="Trainer, Leistungsklasse und Spielberechtigung für die Verbandsmeldung."
        felder={SPORTFELDER}
        {...gemeinsam}
      />
      <StammdatenBlock titel="Intern" text="Nur für den Vorstand sichtbar." felder={INTERNFELDER} {...gemeinsam} />
    </>
  );
}
