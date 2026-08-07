import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useTheme } from "@/lib/theme";
import {
  alsUhrzeit, lokaleMinuten,
  type Belegung, type Buchungsart, type Fenster, type Mitglied,
} from "@/lib/plan";

interface Props {
  fenster: Fenster;
  arten: Buchungsart[];
  verzeichnis: Mitglied[];
  /** Eigene Mitglieds-Id, damit man sich nicht selbst als Mitspieler waehlt. */
  meineId: string | null;
  rasterMinuten: number;
  anzeigeMinuten: number;
  istAdmin: boolean;
  laeuft: boolean;
  /** Gastgebuehr je Gast in Cent. 0 schaltet den Gast-Knopf ab. */
  gastgebuehrCents: number;
  onBuchen: (
    courtId: string, start: number, typ: string, mitglieder: string[], gaeste: string[],
    sucheMitspieler: boolean,
  ) => void;
  onSpeichern: (bookingId: string, mitglieder: string[], gaeste: string[]) => void;
  onStornieren: (bookingId: string) => void;
  onAusschreiben: (bookingId: string, gesucht: boolean) => void;
  onBeitreten: (bookingId: string) => void;
  onSchliessen: () => void;
}

/**
 * Gaeste haben keinen Namen - es geht um die Gebuehr und um den belegten Platz,
 * nicht um eine Gaesteliste. Die Datenbank verlangt einen nicht leeren
 * guest_name, also traegt jeder Gastplatz genau dieses Wort.
 */
const GAST = "Gast";

const EURO = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

/**
 * Modales Fenster fuer Buchen und Verwalten.
 *
 * React Native hat kein <dialog>, deshalb Modal mit
 * onRequestClose - das faengt die Zurueck-Taste auf Android ab und
 * entspricht dem Escape im Web.
 */
export function BuchungsFenster(props: Props) {
  const { stil } = useTheme();

  return (
    <Modal visible transparent animationType="slide" onRequestClose={props.onSchliessen}>
      <Pressable style={stil.fensterHuelle} onPress={props.onSchliessen} accessible={false}>
        {/* Der innere Bereich schluckt den Druck, damit ein Tipp im Fenster es
            nicht sofort wieder schliesst. */}
        <Pressable style={stil.fenster} onPress={() => {}} accessible={false}>
          <ScrollView keyboardShouldPersistTaps="handled">
            {props.fenster.modus === "buchen" ? (
              <BuchenInhalt {...props} fenster={props.fenster} />
            ) : (
              <VerwaltenInhalt {...props} fenster={props.fenster} />
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function BuchenInhalt(props: Props & { fenster: Extract<Fenster, { modus: "buchen" }> }) {
  const { stil, farben } = useTheme();
  const f = props.fenster;

  const haelften = useMemo(() => {
    const out: number[] = [];
    for (let m = f.stunde; m < f.stunde + props.anzeigeMinuten; m += props.rasterMinuten) out.push(m);
    return out;
  }, [f.stunde, props.anzeigeMinuten, props.rasterMinuten]);

  const [start, setStart] = useState(f.startzeiten[0] ?? f.stunde);
  const [art, setArt] = useState(props.arten[0]?.code ?? "einzel");
  const [mitglieder, setMitglieder] = useState<string[]>([]);
  const [gaeste, setGaeste] = useState<string[]>([]);
  const [sucht, setSucht] = useState(false);

  const gewaehlt = props.arten.find((a) => a.code === art);
  const maxWeitere = Math.max((gewaehlt?.max_players ?? 2) - 1, 0);
  const anzahl = mitglieder.length + gaeste.length;
  const nochPlatz = anzahl < maxWeitere;
  // Wer Mitspieler sucht, darf unterbesetzt buchen - genau dafuer ist der
  // Schalter da. Die Datenbank sieht das ebenso.
  const pflichtVerletzt = Boolean(gewaehlt?.requires_partner) && anzahl === 0 && !sucht;

  return (
    <>
      <Text style={stil.fensterTitel}>{f.platzName}</Text>
      <Text style={stil.leise}>
        {alsUhrzeit(f.stunde)}–{alsUhrzeit(f.stunde + props.anzeigeMinuten)} Uhr ·{" "}
        {gewaehlt?.duration_minutes ?? 60} Minuten Spielzeit
      </Text>

      <Text style={[stil.feldLabel, { marginTop: 14 }]}>Beginn</Text>
      <View style={stil.slotreihe}>
        {haelften.map((m) => {
          const frei = f.startzeiten.includes(m);
          const aktiv = start === m;
          return (
            <Pressable
              key={m}
              style={[stil.slot, aktiv && stil.slotAktiv, !frei && { opacity: 0.4 }]}
              disabled={!frei}
              accessibilityRole="button"
              accessibilityState={{ selected: aktiv, disabled: !frei }}
              onPress={() => setStart(m)}
            >
              <Text style={[stil.slotText, aktiv && stil.slotTextAktiv]}>{alsUhrzeit(m)}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[stil.feldLabel, { marginTop: 14 }]}>Buchungsart</Text>
      <View style={stil.slotreihe}>
        {props.arten.map((a) => {
          const aktiv = art === a.code;
          return (
            <Pressable
              key={a.code}
              style={[stil.slot, aktiv && stil.slotAktiv]}
              accessibilityRole="button"
              accessibilityState={{ selected: aktiv }}
              onPress={() => setArt(a.code)}
            >
              <Text style={[stil.slotText, aktiv && stil.slotTextAktiv]}>{a.name}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Sich selbst mitzunehmen weist die Datenbank ab - der Bucher zaehlt
          ohnehin mit. Frueher stand er in der Liste und der Griff danach
          endete in einer Fehlermeldung statt in einer Buchung. */}
      <Mitspielersuche
        verzeichnis={props.verzeichnis.filter((m) => m.id !== props.meineId)}
        mitglieder={mitglieder}
        gaeste={gaeste}
        maxWeitere={maxWeitere}
        pflicht={Boolean(gewaehlt?.requires_partner) && !sucht}
        gastgebuehrCents={props.gastgebuehrCents}
        onMitglieder={setMitglieder}
        onGaeste={setGaeste}
      />

      {nochPlatz && (
        <Pressable
          style={[stil.slot, sucht && stil.slotAktiv, { marginTop: 14 }]}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: sucht }}
          onPress={() => setSucht(!sucht)}
        >
          <Text style={[stil.slotText, sucht && stil.slotTextAktiv]}>
            {sucht ? "✓ " : ""}Mitspieler gesucht
          </Text>
        </Pressable>
      )}
      {nochPlatz && (
        <Text style={stil.leise}>
          Die Buchung erscheint unter „Offene Spiele“. Wer will, trägt sich selbst ein.
        </Text>
      )}

      <Pressable
        style={[stil.knopf, { marginTop: 18 }, (props.laeuft || pflichtVerletzt) && { opacity: 0.5 }]}
        disabled={props.laeuft || pflichtVerletzt}
        accessibilityRole="button"
        onPress={() => props.onBuchen(f.courtId, start, art, mitglieder, gaeste, sucht)}
      >
        <Text style={stil.knopfText}>
          {props.laeuft ? "Wird gebucht…" : `Verbindlich für ${alsUhrzeit(start)} buchen`}
        </Text>
      </Pressable>

      <Pressable
        style={[stil.knopfLeise, { marginTop: 8 }]}
        accessibilityRole="button"
        onPress={props.onSchliessen}
      >
        <Text style={[stil.knopfLeiseText, { color: farben.ink2 }]}>Abbrechen</Text>
      </Pressable>
    </>
  );
}

function VerwaltenInhalt(props: Props & { fenster: Extract<Fenster, { modus: "verwalten" }> }) {
  const { stil, farben } = useTheme();
  const b: Belegung = props.fenster.belegung;

  const [mitglieder, setMitglieder] = useState<string[]>(b.player_member_ids ?? []);
  const [gaeste, setGaeste] = useState<string[]>(b.guest_names ?? []);
  const [stornoOffen, setStornoOffen] = useState(false);

  const art = props.arten.find((a) => a.code === b.type_code);
  const maxWeitere = Math.max((art?.max_players ?? 4) - 1, 0);
  const nurStorno = b.kind === "blocking";

  // Drei Rollen an demselben Fenster: der Bucher verwaltet, ein Admin
  // verwaltet fremd, und wer nur eingeladen ist, kann ausschliesslich
  // mitspielen. Ohne diese Trennung koennte ein Fremder ueber die
  // Mitspielersuche die Besetzung des Buchers umwerfen.
  const darfVerwalten = b.is_own === true || props.istAdmin;
  const kannMitspielen =
    b.is_own !== true && b.bin_dabei !== true && b.partner_wanted === true && b.frei > 0;
  const geaendert =
    JSON.stringify([...mitglieder].sort()) !== JSON.stringify([...(b.player_member_ids ?? [])].sort()) ||
    JSON.stringify([...gaeste].sort()) !== JSON.stringify([...(b.guest_names ?? [])].sort());

  return (
    <>
      <Text style={stil.fensterTitel}>
        {props.fenster.platzName}, {alsUhrzeit(lokaleMinuten(b.starts_at))}–
        {alsUhrzeit(lokaleMinuten(b.ends_at))}
      </Text>
      <Text style={stil.leise}>
        {nurStorno
          ? `${b.title ?? b.type_name} · Blockung`
          : `${b.type_name} · gebucht von ${b.owner_name ?? "unbekannt"}`}
      </Text>

      {props.istAdmin && !b.is_own && (
        <Text style={[stil.leise, { marginTop: 8 }]}>
          Du bearbeitest eine fremde Buchung als Administrator.
        </Text>
      )}

      {b.partner_wanted === true && b.frei > 0 && (
        <Text style={[stil.leise, { marginTop: 8 }]}>
          Hier {b.frei === 1 ? "wird noch ein Mitspieler" : `werden noch ${b.frei} Mitspieler`}{" "}
          gesucht.
        </Text>
      )}

      {!nurStorno && darfVerwalten && (
        <Mitspielersuche
          verzeichnis={props.verzeichnis.filter((m) => m.id !== b.owner_member_id)}
          mitglieder={mitglieder}
          gaeste={gaeste}
          maxWeitere={maxWeitere}
          pflicht={Boolean(art?.requires_partner) && b.partner_wanted !== true}
          gastgebuehrCents={props.gastgebuehrCents}
          onMitglieder={setMitglieder}
          onGaeste={setGaeste}
        />
      )}

      {!darfVerwalten && b.players.length > 0 && (
        <Text style={[stil.leise, { marginTop: 8 }]}>Dabei sind: {b.players.join(", ")}</Text>
      )}

      {kannMitspielen && (
        <Pressable
          style={[stil.knopf, { marginTop: 18 }, props.laeuft && { opacity: 0.5 }]}
          disabled={props.laeuft}
          accessibilityRole="button"
          onPress={() => props.onBeitreten(b.booking_id)}
        >
          <Text style={stil.knopfText}>
            {props.laeuft ? "Wird eingetragen…" : "Mitspielen"}
          </Text>
        </Pressable>
      )}

      {!nurStorno && darfVerwalten && (
        <Pressable
          style={[stil.knopf, { marginTop: 18 }, (props.laeuft || !geaendert) && { opacity: 0.5 }]}
          disabled={props.laeuft || !geaendert}
          accessibilityRole="button"
          onPress={() => props.onSpeichern(b.booking_id, mitglieder, gaeste)}
        >
          <Text style={stil.knopfText}>
            {props.laeuft ? "Wird gespeichert…" : "Mitspieler speichern"}
          </Text>
        </Pressable>
      )}

      {!nurStorno && darfVerwalten && (b.frei > 0 || b.partner_wanted === true) && (
        <Pressable
          style={[stil.knopfLeise, { marginTop: 8 }]}
          disabled={props.laeuft}
          accessibilityRole="button"
          onPress={() => props.onAusschreiben(b.booking_id, b.partner_wanted !== true)}
        >
          <Text style={stil.knopfLeiseText}>
            {b.partner_wanted === true ? "Nicht mehr ausschreiben" : "Mitspieler suchen"}
          </Text>
        </Pressable>
      )}

      {darfVerwalten && (
        <Pressable
          style={[
            stil.knopfLeise,
            { marginTop: 8 },
            stornoOffen && { backgroundColor: farben.red, borderColor: farben.red },
          ]}
          disabled={props.laeuft}
          accessibilityRole="button"
          onPress={() => (stornoOffen ? props.onStornieren(b.booking_id) : setStornoOffen(true))}
        >
          <Text style={[stil.knopfLeiseText, { color: stornoOffen ? "#fff" : farben.red }]}>
            {stornoOffen ? "Wirklich stornieren" : "Buchung stornieren"}
          </Text>
        </Pressable>
      )}

      <Pressable
        style={[stil.knopfLeise, { marginTop: 8 }]}
        accessibilityRole="button"
        onPress={props.onSchliessen}
      >
        <Text style={[stil.knopfLeiseText, { color: farben.ink2 }]}>Schließen</Text>
      </Pressable>
    </>
  );
}

const TREFFER_MAX = 6;

/**
 * Mitspieler durch Tippen finden - rund 300 Mitglieder sind als Auswahlliste
 * am Telefon unbenutzbar.
 *
 * Im Feld stehen ausschliesslich Mitglieder. Gaeste kommen ueber einen eigenen
 * Knopf daneben: sie kosten Geld, und das soll eine bewusste Handlung sein und
 * kein Nebeneffekt davon, dass die Suche nichts gefunden hat.
 */
function Mitspielersuche({
  verzeichnis, mitglieder, gaeste, maxWeitere, pflicht, gastgebuehrCents,
  onMitglieder, onGaeste,
}: {
  verzeichnis: Mitglied[];
  mitglieder: string[];
  gaeste: string[];
  maxWeitere: number;
  pflicht: boolean;
  gastgebuehrCents: number;
  onMitglieder: (ids: string[]) => void;
  onGaeste: (namen: string[]) => void;
}) {
  const { stil, farben } = useTheme();
  const [suche, setSuche] = useState("");

  const voll = mitglieder.length + gaeste.length >= maxWeitere;

  const gewaehlt = useMemo(
    () =>
      mitglieder
        .map((id) => verzeichnis.find((m) => m.id === id))
        .filter((m): m is Mitglied => Boolean(m)),
    [mitglieder, verzeichnis],
  );

  const treffer = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (q.length === 0) return [];
    return verzeichnis
      .filter((m) => !mitglieder.includes(m.id))
      .filter(
        (m) =>
          `${m.first_name} ${m.last_name}`.toLowerCase().includes(q) ||
          `${m.last_name} ${m.first_name}`.toLowerCase().includes(q),
      )
      .slice(0, TREFFER_MAX);
  }, [suche, verzeichnis, mitglieder]);

  return (
    <View style={{ marginTop: 14, gap: 8 }}>
      <Text style={stil.feldLabel}>Mitspieler{pflicht ? " (Pflicht)" : ""}</Text>

      {(gewaehlt.length > 0 || gaeste.length > 0) && (
        <View style={stil.slotreihe}>
          {gewaehlt.map((m) => (
            <View key={m.id} style={stil.marke}>
              <Text style={stil.markeText}>{m.first_name} {m.last_name}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${m.first_name} ${m.last_name} entfernen`}
                onPress={() => onMitglieder(mitglieder.filter((x) => x !== m.id))}
              >
                <Text style={stil.markeWeg}>×</Text>
              </Pressable>
            </View>
          ))}
          {gaeste.map((g, i) => (
            <View key={`g${i}`} style={[stil.marke, stil.markeGast]}>
              <Text style={stil.markeText}>{g}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Gast ${i + 1} entfernen`}
                onPress={() => onGaeste(gaeste.filter((_, k) => k !== i))}
              >
                <Text style={stil.markeWeg}>×</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {voll ? (
        <Text style={stil.leise}>Für diese Buchungsart sind alle Plätze besetzt.</Text>
      ) : (
        <>
          <TextInput
            style={stil.feld}
            value={suche}
            onChangeText={setSuche}
            placeholder="Namen tippen…"
            placeholderTextColor={farben.muted}
            autoCapitalize="words"
            autoCorrect={false}
            accessibilityLabel="Mitspieler suchen"
          />

          {suche.trim().length > 0 && (
            <View style={{ gap: 4 }}>
              {treffer.length === 0 ? (
                <Text style={stil.leise}>Niemand gefunden.</Text>
              ) : (
                treffer.map((m) => (
                  <Pressable
                    key={m.id}
                    style={stil.trefferzeile}
                    accessibilityRole="button"
                    onPress={() => {
                      onMitglieder([...mitglieder, m.id]);
                      setSuche("");
                    }}
                  >
                    <Text style={stil.text}>{m.last_name}, {m.first_name}</Text>
                  </Pressable>
                ))
              )}
            </View>
          )}

          <Pressable
            style={stil.knopfLeise}
            accessibilityRole="button"
            accessibilityLabel="Gast hinzufügen"
            onPress={() => {
              onGaeste([...gaeste, GAST]);
              setSuche("");
            }}
          >
            <Text style={stil.knopfLeiseText}>+ Gast</Text>
          </Pressable>
        </>
      )}

      {gaeste.length > 0 && gastgebuehrCents > 0 && (
        <Text style={stil.leise}>
          Für jeden Gast werden {EURO.format(gastgebuehrCents / 100)} berechnet und mit der
          nächsten Lastschrift eingezogen.
        </Text>
      )}
    </View>
  );
}
