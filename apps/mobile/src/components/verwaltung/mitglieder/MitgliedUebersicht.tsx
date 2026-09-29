/**
 * Ein Mitglied, aufgebaut wie das eigene Konto (Nachbau von
 * apps/web/src/components/MitgliedUebersicht.tsx)
 *
 * Kopf mit Avatar, Name, Nummer und Marken, drei Schnellaktionen, darunter
 * gruppierte Abschnitte. Jede Zeile oeffnet einen Bereich (?bereich=…), dort
 * stehen die Formulare. Am Ende Protokoll, Zugang und Austritt.
 */

import { Linking, Pressable, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import Svg, { Path } from "react-native-svg";
import { formatCents } from "@tcm/core";
import { Abschnitt, Avatar, Gruppenkopf, ListenGruppe, Listenzeile, Statusmarke } from "@/components/verwaltung/Liste";
import { useTheme } from "@/lib/theme";
import type { MitgliedUebersichtDaten } from "@/lib/verwaltung/mitglieder";
import { datum, type Bereich } from "@/components/verwaltung/mitglieder/optionen";

const TELEFON =
  "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z";
const POST = "M3 5h18v14H3zM3 6l9 7 9-7";
const SENDEN = "M22 2 11 13M22 2l-7 20-4-9-9-4z";

export function MitgliedUebersicht({ d }: { d: MitgliedUebersichtDaten }) {
  const { farben, stil } = useTheme();
  const m = d.m;
  const s = d.mitgliedschaft;
  const teil = (t: Bereich) => `/verwaltung/mitglieder/${m.id}?bereich=${t}`;
  const telefon = m.mobile ?? m.phone;
  const kurz = (m.first_name[0] ?? "") + (m.last_name[0] ?? "");

  const schnell = [
    { name: "Anrufen", d: TELEFON, an: telefon ? () => void Linking.openURL(`tel:${telefon.replace(/\s/g, "")}`) : null },
    { name: "E-Mail", d: POST, an: m.email ? () => void Linking.openURL(`mailto:${m.email}`) : null },
    { name: "Einladen", d: SENDEN, an: d.zugang ? null : () => router.push(teil("zugang") as Href) },
  ];

  return (
    <>
      {/* --- Profil ------------------------------------------------------- */}
      <View style={{ alignItems: "center", gap: 8 }}>
        <Avatar kurz={kurz} id={m.id} groesse={84} />
        <Text
          accessibilityRole="header"
          style={{ fontSize: 26, lineHeight: 30, fontFamily: "Barlow_800ExtraBold", color: farben.ink, textAlign: "center" }}
        >
          {m.first_name} {m.last_name}
        </Text>
        <Text style={[stil.leise, { textAlign: "center" }]}>
          {[s?.number ? `Nr. ${s.number}` : null, s?.started_on ? `Mitglied seit ${s.started_on.slice(0, 4)}` : null]
            .filter(Boolean)
            .join(" · ")}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6 }}>
          {m.status !== "active" && <Statusmarke ton="rot" text={m.status === "archived" ? "archiviert" : "inaktiv"} />}
          {d.arten[0] && <Statusmarke text={d.arten[0]} />}
          {m.teams?.name && <Statusmarke text={m.teams.name} />}
          <Statusmarke ton={d.zugang ? "gruen" : "grau"} text={d.zugang ? "App-Zugang aktiv" : "kein Zugang"} />
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 10 }}>
        {schnell.map((x) => (
          <Pressable
            key={x.name}
            onPress={x.an ?? undefined}
            disabled={!x.an}
            accessibilityRole="button"
            accessibilityState={{ disabled: !x.an }}
            style={({ pressed }) => ({
              flex: 1, alignItems: "center", gap: 6, paddingVertical: 12, borderRadius: 18,
              backgroundColor: farben.surf, borderWidth: 1, borderColor: pressed ? farben.blue : farben.line,
              opacity: x.an ? 1 : 0.45,
            })}
          >
            <Svg width={22} height={22} viewBox="0 0 24 24">
              <Path d={x.d} fill="none" stroke={farben.blueInk} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
            <Text style={{ fontSize: 13, fontFamily: "Barlow_700Bold", color: farben.ink }}>{x.name}</Text>
          </Pressable>
        ))}
      </View>

      {/* --- Mitgliedschaft ----------------------------------------------- */}
      <Abschnitt>
        <Gruppenkopf titel="Mitgliedschaft" />
        <ListenGruppe>
          <Listenzeile href={teil("beitraege")} titel="Art" hinweis={d.arten.join(" + ") || "keine"} />
          <Listenzeile href={teil("mitgliedschaft")} titel="Mannschaft" hinweis={m.teams?.name ?? "keine"} />
          <Listenzeile href={teil("merkmale")} titel="Merkmale" hinweis={String(d.sonstigeMerkmale)} />
        </ListenGruppe>
      </Abschnitt>

      {/* --- Geld --------------------------------------------------------- */}
      <Abschnitt>
        <Gruppenkopf titel="Geld" neben={d.offenSumme > 0 ? `${formatCents(d.offenSumme)} offen` : undefined} />
        <ListenGruppe>
          <Listenzeile
            href={teil("forderungen")}
            titel="Forderungen"
            hinweis={d.offenZahl > 0 ? `${d.offenZahl} offen` : "keine offen"}
            hinweisTon={d.offenZahl > 0 ? "gold" : "leise"}
          />
          <Listenzeile
            href={teil("bank")}
            titel="SEPA-Mandat"
            hinweis={d.mandatDa ? (m.billing_payer_id ? "beim Zahler" : "liegt vor") : "fehlt"}
            hinweisTon={d.mandatDa ? "gruen" : "rot"}
          />
          <Listenzeile href={teil("bank")} titel="Konto" hinweis={d.konto ? `•• ${d.konto.iban_last4}` : "keins"} />
          <Listenzeile href={teil("beitraege")} titel="Beitragsarten" hinweis={String(d.arten.length)} />
        </ListenGruppe>
      </Abschnitt>

      {/* --- Kontakt & Daten ---------------------------------------------- */}
      <Abschnitt>
        <Gruppenkopf titel="Kontakt & Daten" />
        <ListenGruppe>
          <Listenzeile href={teil("stammdaten")} titel="Stammdaten" />
          <Listenzeile href={teil("stammdaten")} titel="Notfallkontakt" hinweis={m.emergency_contact_name ? "hinterlegt" : "fehlt"} />
          <Listenzeile href={teil("merkmale")} titel="Einwilligungen" hinweis={`${d.erteilt} von ${d.einwilligungen}`} />
        </ListenGruppe>
      </Abschnitt>

      {/* --- Arbeitsdienst ------------------------------------------------ */}
      <Abschnitt>
        <Gruppenkopf titel={`Arbeitsdienst ${d.jahr}`} />
        <Pressable
          onPress={() => router.push("/verwaltung/arbeitsdienst" as Href)}
          accessibilityRole="link"
          style={({ pressed }) => [stil.karte, { gap: 10 }, pressed && { borderColor: farben.line2 }]}
        >
          {d.dienst ? (
            <>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                <Text style={{ fontSize: 15, fontFamily: "Barlow_600SemiBold", color: farben.ink2 }}>Geleistet</Text>
                <Text style={{ fontSize: 19, fontFamily: "BarlowSemiCondensed_700Bold", color: farben.ink, fontVariant: ["tabular-nums"] }}>
                  {d.dienst.ist} / {d.dienst.soll} h
                </Text>
              </View>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: farben.surf2, overflow: "hidden" }}>
                <View
                  style={{
                    height: 8, borderRadius: 4, backgroundColor: farben.green,
                    width: `${Math.min(100, (d.dienst.ist / Math.max(1, d.dienst.soll)) * 100)}%`,
                  }}
                />
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                <Text style={stil.leise}>{d.letzterDienst ? `Letzter Eintrag ${datum(d.letzterDienst)}` : "Noch kein Eintrag"}</Text>
                <Text style={{ fontSize: 13, fontFamily: "Barlow_700Bold", color: farben.blueInk }}>Stunden eintragen</Text>
              </View>
            </>
          ) : (
            <Text style={stil.leise}>Für die Beitragsart ist kein Arbeitsdienst vorgesehen.</Text>
          )}
        </Pressable>
      </Abschnitt>

      {/* --- Weiteres ----------------------------------------------------- */}
      <ListenGruppe>
        <Listenzeile href={teil("protokoll")} titel="Änderungsprotokoll" />
        <Listenzeile href={teil("zugang")} titel={d.zugang ? "Zugang sperren" : "Zugang"} />
        <Listenzeile href={teil("austritt")} titel="Austritt eintragen" gefahr />
      </ListenGruppe>
    </>
  );
}
