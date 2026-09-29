/**
 * Formulare der Verwaltung (docs/design/clubhaus/verwaltung, Regel 5)
 *
 * Im Web stehen Formulare als Blatt: Felder gruppiert auf surf-2, Label links,
 * Wert rechts (.blatt .formraster). Hier dieselben Bausteine fuer React
 * Native. Ein Formular ist ein Blatt (FormBlatt) mit einer oder mehreren
 * FormGruppen, darunter die Meldung und ein grosser Knopf.
 *
 * Ohne Datumswaehler-Bibliothek: Daten werden deutsch getippt (TT.MM.JJJJ)
 * und in der Datenschicht nach ISO gewandelt (deutschZuIso).
 */

import { Children, Fragment, isValidElement, useState, type ReactNode } from "react";
import {
  ActivityIndicator, Alert, Platform, Pressable, Text, TextInput, View, type KeyboardTypeOptions,
} from "react-native";
import { Blatt, BlattKopf } from "@/components/Blatt";
import { Schalter } from "@/components/Segmente";
import { useTheme } from "@/lib/theme";

// ---------------------------------------------------------------------------
// Blatt
// ---------------------------------------------------------------------------

/** Ein Formular als Blatt mit Titel, Unterzeile und Schliessen-Knopf. */
export function FormBlatt({
  titel,
  kicker,
  unterzeile,
  onSchliessen,
  children,
}: {
  titel: string;
  kicker?: string;
  unterzeile?: string;
  onSchliessen: () => void;
  children: (schliessen: () => void) => ReactNode;
}) {
  const { stil } = useTheme();
  return (
    <Blatt onSchliessen={onSchliessen}>
      {(schliessen) => (
        <>
          <View style={{ gap: 6 }}>
            <BlattKopf titel={titel} kicker={kicker} onZu={schliessen} />
            {unterzeile && <Text style={[stil.leise, { fontSize: 14 }]}>{unterzeile}</Text>}
          </View>
          {children(schliessen)}
        </>
      )}
    </Blatt>
  );
}

// ---------------------------------------------------------------------------
// Gruppen und Felder
// ---------------------------------------------------------------------------

/** Felder gruppiert auf surf-2, Radius 18, Linie zwischen den Zeilen. */
export function FormGruppe({ children, titel }: { children: ReactNode; titel?: string }) {
  const { farben, stil } = useTheme();
  const flach: ReactNode[] = [];
  Children.forEach(children, (k) => {
    if (isValidElement(k) && k.type === Fragment) {
      Children.forEach((k.props as { children?: ReactNode }).children, (e) => {
        if (e !== null && e !== undefined && e !== false) flach.push(e);
      });
    } else if (k !== null && k !== undefined && k !== false) {
      flach.push(k);
    }
  });
  return (
    <View style={{ gap: 8 }}>
      {titel && <Text style={[stil.feldLabel, { marginBottom: 0, marginLeft: 4 }]}>{titel}</Text>}
      <View style={{ backgroundColor: farben.surf2, borderRadius: 18, overflow: "hidden" }}>
        {flach.map((k, i) => (
          <View key={i} style={i > 0 ? { borderTopWidth: 1, borderTopColor: farben.line } : undefined}>
            {k}
          </View>
        ))}
      </View>
    </View>
  );
}

/** Eine Zeile: Label links (104 breit), Eingabe rechts. */
export function FormFeld({
  label,
  wert,
  onAendern,
  platzhalter,
  tastatur,
  mehrzeilig,
  beschreibung,
  gross,
  sicher,
  autoFokus,
  editierbar = true,
}: {
  label: string;
  wert: string;
  onAendern: (w: string) => void;
  platzhalter?: string;
  tastatur?: KeyboardTypeOptions;
  mehrzeilig?: boolean;
  beschreibung?: string;
  /** Wie autoCapitalize: fuer Namen "words", fuer IBAN "characters" */
  gross?: "none" | "sentences" | "words" | "characters";
  sicher?: boolean;
  autoFokus?: boolean;
  editierbar?: boolean;
}) {
  const { farben } = useTheme();
  return (
    <View style={{ paddingHorizontal: 16 }}>
      <View style={{ flexDirection: "row", alignItems: mehrzeilig ? "flex-start" : "center", gap: 12, minHeight: 52 }}>
        <Text
          style={{
            width: 104, fontSize: 15, fontFamily: "Barlow_600SemiBold", color: farben.ink2,
            paddingTop: mehrzeilig ? 15 : 0,
          }}
        >
          {label}
        </Text>
        <TextInput
          value={wert}
          onChangeText={onAendern}
          placeholder={platzhalter}
          placeholderTextColor={farben.muted}
          keyboardType={tastatur}
          multiline={mehrzeilig}
          autoCapitalize={gross ?? "sentences"}
          autoCorrect={false}
          secureTextEntry={sicher}
          autoFocus={autoFokus}
          editable={editierbar}
          accessibilityLabel={label}
          style={{
            flex: 1, minWidth: 0, paddingVertical: 14, fontSize: 16, color: editierbar ? farben.ink : farben.muted,
            fontFamily: "Barlow_400Regular", minHeight: mehrzeilig ? 88 : undefined,
            textAlignVertical: mehrzeilig ? "top" : "center",
          }}
        />
      </View>
      {beschreibung && (
        <Text style={{ fontSize: 12.5, color: farben.muted, fontFamily: "Barlow_400Regular", marginTop: -6, marginBottom: 10 }}>
          {beschreibung}
        </Text>
      )}
    </View>
  );
}

/** Zeile mit Schalter rechts, etwa "aktiv" oder "Einladung senden". */
export function FormSchalter({
  label,
  an,
  onWechsel,
  beschreibung,
  deaktiviert,
}: {
  label: string;
  an: boolean;
  onWechsel: (an: boolean) => void;
  beschreibung?: string;
  deaktiviert?: boolean;
}) {
  const { farben } = useTheme();
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 15, fontFamily: "Barlow_600SemiBold", color: farben.ink2 }}>{label}</Text>
        {beschreibung && (
          <Text style={{ fontSize: 12.5, color: farben.muted, fontFamily: "Barlow_400Regular" }}>{beschreibung}</Text>
        )}
      </View>
      <Schalter an={an} onWechsel={onWechsel} beschriftung={label} deaktiviert={deaktiviert} />
    </View>
  );
}

export interface Option<T extends string> {
  wert: T;
  label: string;
  info?: string;
}

/**
 * Auswahl als Zeile: zeigt den gewaehlten Wert, auf Tippen klappt die Liste
 * darunter auf. Ersatz fuer <select> bei mehr als einer Handvoll Optionen.
 */
export function FormAuswahl<T extends string>({
  label,
  wert,
  optionen,
  onWahl,
  leer = "Bitte wählen",
}: {
  label: string;
  wert: T | "";
  optionen: Option<T>[];
  onWahl: (w: T) => void;
  leer?: string;
}) {
  const { farben } = useTheme();
  const [offen, setOffen] = useState(false);
  const gewaehlt = optionen.find((o) => o.wert === wert);

  return (
    <View>
      <Pressable
        onPress={() => setOffen(!offen)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${gewaehlt?.label ?? leer}`}
        accessibilityState={{ expanded: offen }}
        style={{ paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52 }}
      >
        <Text style={{ width: 104, fontSize: 15, fontFamily: "Barlow_600SemiBold", color: farben.ink2 }}>{label}</Text>
        <Text
          numberOfLines={1}
          style={{ flex: 1, fontSize: 16, fontFamily: "Barlow_400Regular", color: gewaehlt ? farben.ink : farben.muted }}
        >
          {gewaehlt?.label ?? leer}
        </Text>
        <Text style={{ color: farben.muted, fontSize: 14 }}>{offen ? "▲" : "▼"}</Text>
      </Pressable>
      {offen && (
        <View style={{ paddingHorizontal: 8, paddingBottom: 8, gap: 2 }}>
          {optionen.map((o) => {
            const aktiv = o.wert === wert;
            return (
              <Pressable
                key={o.wert}
                onPress={() => {
                  onWahl(o.wert);
                  setOffen(false);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: aktiv }}
                style={{
                  paddingVertical: 11, paddingHorizontal: 12, borderRadius: 12,
                  backgroundColor: aktiv ? farben.blueSoft : "transparent",
                }}
              >
                <Text style={{ fontSize: 15, fontFamily: aktiv ? "Barlow_700Bold" : "Barlow_500Medium", color: farben.ink }}>
                  {o.label}
                </Text>
                {o.info && <Text style={{ fontSize: 12.5, color: farben.muted, fontFamily: "Barlow_400Regular" }}>{o.info}</Text>}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

/** Chips statt Auswahlliste bei bis zu acht Optionen (.chipwahl). */
export function Chipwahl<T extends string | number>({
  label,
  optionen,
  wert,
  onWahl,
  mehrfach,
}: {
  label?: string;
  optionen: { wert: T; label: string }[];
  /** Bei mehrfach eine Liste */
  wert: T | T[] | null;
  onWahl: (w: T) => void;
  mehrfach?: boolean;
}) {
  const { farben, stil } = useTheme();
  const istAktiv = (w: T) => (mehrfach && Array.isArray(wert) ? wert.includes(w) : wert === w);
  return (
    <View style={{ gap: 8 }}>
      {label && <Text style={[stil.feldLabel, { marginBottom: 0 }]}>{label}</Text>}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }} accessibilityRole={mehrfach ? undefined : "radiogroup"}>
        {optionen.map((o) => {
          const aktiv = istAktiv(o.wert);
          return (
            <Pressable
              key={String(o.wert)}
              onPress={() => onWahl(o.wert)}
              accessibilityRole={mehrfach ? "checkbox" : "radio"}
              accessibilityState={mehrfach ? { checked: aktiv } : { selected: aktiv }}
              style={{
                minHeight: 40, paddingHorizontal: 14, borderRadius: 14, justifyContent: "center",
                backgroundColor: aktiv ? farben.ink : farben.surf2,
              }}
            >
              <Text style={{ fontSize: 13.5, fontFamily: "Barlow_700Bold", color: aktiv ? farben.bg : farben.ink2 }}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Knoepfe und Meldungen
// ---------------------------------------------------------------------------

export type KnopfArt = "blau" | "gold" | "leise" | "gefahr";

export function Knopf({
  text,
  onPress,
  art = "blau",
  laeuft,
  laeuftText,
  deaktiviert,
  klein,
  gross,
}: {
  text: string;
  onPress: () => void;
  art?: KnopfArt;
  laeuft?: boolean;
  laeuftText?: string;
  deaktiviert?: boolean;
  klein?: boolean;
  /** .knopf.gross: 58 hoch, fuer die Hauptaktion unter einem Formular */
  gross?: boolean;
}) {
  const { farben, stil } = useTheme();
  const aus = deaktiviert || laeuft;
  const flaeche =
    art === "gold" ? stil.knopfGold
    : art === "leise" ? stil.knopfLeise
    : art === "gefahr" ? { backgroundColor: farben.red }
    : null;
  const textFarbe =
    art === "gold" ? farben.onGold : art === "leise" ? farben.ink : "#fff";

  return (
    <Pressable
      onPress={onPress}
      disabled={aus}
      accessibilityRole="button"
      accessibilityState={{ disabled: aus, busy: laeuft }}
      style={({ pressed }) => [
        art === "leise" ? stil.knopfLeise : stil.knopf,
        flaeche,
        klein && stil.knopfKlein,
        gross && { minHeight: 58, borderRadius: 18, justifyContent: "center" },
        { flexDirection: "row", justifyContent: "center", gap: 8 },
        (pressed || aus) && { opacity: aus ? 0.55 : 0.85 },
      ]}
    >
      {laeuft && <ActivityIndicator size="small" color={textFarbe} />}
      <Text
        style={[
          stil.knopfText,
          { color: textFarbe },
          klein && stil.knopfKleinText,
          gross && { fontFamily: "Barlow_800ExtraBold", fontSize: 17 },
        ]}
      >
        {laeuft && laeuftText ? laeuftText : text}
      </Text>
    </Pressable>
  );
}

/** Rueckmeldung nach einer Aktion: gruen oder rot. */
export function Meldung({ meldung }: { meldung: { ok: boolean; text: string } | null }) {
  const { stil } = useTheme();
  if (!meldung) return null;
  return (
    <Text accessibilityLiveRegion="polite" style={meldung.ok ? stil.hinweisErfolg : stil.hinweisFehler}>
      {meldung.text}
    </Text>
  );
}

/** Folgen vor dem Absenden (.folgen): gestrichelt auf goldSoft. */
export function Folgen({ children }: { children: ReactNode }) {
  const { farben } = useTheme();
  return (
    <View
      style={{
        padding: 12, paddingHorizontal: 14, borderRadius: 16, gap: 4,
        backgroundColor: farben.goldSoft, borderWidth: 1.5, borderStyle: "dashed", borderColor: farben.goldLine,
      }}
    >
      {typeof children === "string" ? (
        <Text style={{ fontSize: 14, lineHeight: 19.5, color: farben.ink, fontFamily: "Barlow_400Regular" }}>{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}

/**
 * Rueckfrage vor einer folgenreichen Aktion. Im Web ein confirm() oder ein
 * zweiter Knopf; hier der native Dialog.
 *
 * Alert.alert ist in react-native-web ein leerer Aufruf - im Browser (der
 * Web-Vorschau der App) erschiene keine Rueckfrage, und die Aktion liesse
 * sich nie ausloesen. Dort springt window.confirm ein.
 */
export function bestaetige(
  titel: string,
  text: string,
  ja: string,
  aktion: () => void,
  gefaehrlich = true,
): void {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.confirm(`${titel}\n\n${text}`)) aktion();
    return;
  }
  Alert.alert(titel, text, [
    { text: "Abbrechen", style: "cancel" },
    { text: ja, style: gefaehrlich ? "destructive" : "default", onPress: aktion },
  ]);
}

/**
 * Laeuft-Zustand und Meldung fuer eine Aktion - der Ersatz fuer
 * useTransition + useState in den Web-Formularen.
 */
export function useAktion() {
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  async function ausfuehren<T extends { ok: boolean; meldung: string }>(
    aktion: () => Promise<T>,
    nachErfolg?: (e: T) => void | Promise<void>,
  ): Promise<T | null> {
    setLaeuft(true);
    setMeldung(null);
    try {
      const e = await aktion();
      setMeldung({ ok: e.ok, text: e.meldung });
      if (e.ok) await nachErfolg?.(e);
      return e;
    } catch (f) {
      setMeldung({ ok: false, text: f instanceof Error ? f.message : "Unbekannter Fehler." });
      return null;
    } finally {
      setLaeuft(false);
    }
  }

  return { laeuft, meldung, setMeldung, ausfuehren };
}

/** Karte mit Titel fuer Detailbereiche (.karte mit h2). */
export function Karte({ titel, children, unterzeile }: { titel?: string; unterzeile?: string; children: ReactNode }) {
  const { stil, farben } = useTheme();
  return (
    <View style={stil.karte}>
      {titel && (
        <Text accessibilityRole="header" style={{ fontSize: 18, fontFamily: "Barlow_700Bold", color: farben.ink }}>
          {titel}
        </Text>
      )}
      {unterzeile && <Text style={[stil.leise, { fontSize: 14 }]}>{unterzeile}</Text>}
      {children}
    </View>
  );
}

/** Zwei Werte in einer Zeile: Name links, Wert rechts (Definitionsliste). */
export function Wertzeile({ name, wert }: { name: string; wert: ReactNode }) {
  const { farben } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 4 }}>
      <Text style={{ fontSize: 14, color: farben.muted, fontFamily: "Barlow_500Medium" }}>{name}</Text>
      {typeof wert === "string" || typeof wert === "number" ? (
        <Text style={{ fontSize: 14, color: farben.ink, fontFamily: "Barlow_600SemiBold", textAlign: "right", flexShrink: 1 }}>
          {wert}
        </Text>
      ) : (
        wert
      )}
    </View>
  );
}
