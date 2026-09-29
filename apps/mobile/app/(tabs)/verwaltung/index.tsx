/**
 * Der Einstieg in die Verwaltung (Entwurf AdminUebersicht, docs/design/clubhaus)
 *
 * Wie apps/web/src/app/admin/page.tsx in der Telefonansicht: was heute zu
 * tun ist (die dringendste Aufgabe als grosse Karte), der Weg des Geldes fuer
 * den juengsten offenen Lastschriftlauf, vier Kennzahlen, die Anlage heute
 * und darunter die Bereiche. Welcher Schritt dran ist und was auf die Liste
 * gehoert, rechnet @tcm/core (debitFlow, adminTodos).
 *
 * Nur Lesen. Jede Quelle wird fuer sich geladen; schlaegt eine fehl, zeigt
 * nur ihr Abschnitt den Fehler.
 */

import { useCallback, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { router, useFocusEffect, type Href } from "expo-router";
import Svg, { Path } from "react-native-svg";
import {
  adminTodos, debitFlow, formatCents, localMinutes, timeToMinutes, timelinePosition, timelineSegments,
  type DebitBatchStatus,
} from "@tcm/core";
import { Bildschirm } from "@/components/Bildschirm";
import { GrosserKopf } from "@/components/GrosserKopf";
import { MiniZeitleiste } from "@/components/MiniZeitleiste";
import { Symbol, type SymbolName } from "@/components/Symbol";
import { Knopf } from "@/components/verwaltung/Formular";
import { GeldwegBalken } from "@/components/verwaltung/Geldweg";
import {
  Abschnitt, Gruppenkopf, Kennzahl, Kennzahlen, ListenGruppe, Listenzeile, Statusmarke,
} from "@/components/verwaltung/Liste";
import { useLaden } from "@/lib/laden";
import { useTheme } from "@/lib/theme";
import { appPfad } from "@/lib/verwaltung/gemeinsam";
import { ladeUebersicht } from "@/lib/verwaltung/uebersicht";

const HEUTE_LANG = new Intl.DateTimeFormat("de-DE", {
  weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Berlin",
});

/** Die Bereiche als Liste - dieselbe Reihenfolge wie im Web. */
const BEREICHE: { href: string; label: string; symbol: SymbolName }[] = [
  { href: "/verwaltung/mitglieder", label: "Mitglieder", symbol: "mitglieder" },
  { href: "/verwaltung/arbeitsdienst", label: "Arbeitsdienst", symbol: "dienst" },
  { href: "/verwaltung/kasse", label: "Kasse", symbol: "kasse" },
  { href: "/verwaltung/plaetze", label: "Plätze & Serien", symbol: "serie" },
  { href: "/verwaltung/getraenke", label: "Getränke", symbol: "getraenk" },
  { href: "/verwaltung/system", label: "System", symbol: "system" },
];

export default function VerwaltungUebersicht() {
  const { farben, stil } = useTheme();
  const zustand = useLaden(ladeUebersicht);
  const d = zustand.daten;

  // Nach der Rueckkehr aus einem Bereich stimmen die Zahlen sonst nicht mehr.
  // Beim ersten Fokus laedt useLaden ohnehin; ueber die Referenz haengt der
  // Effekt nicht an der bei jedem Rendern neuen Funktion.
  const holen = useRef(zustand.erneutHolen);
  holen.current = zustand.erneutHolen;
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

  const kopf = (
    <GrosserKopf titel="Verwaltung" kicker={HEUTE_LANG.format(new Date())} />
  );

  if (!d) {
    return <Bildschirm kopf={kopf} laedt={zustand.laedt} fehler={zustand.fehler}>{null}</Bildschirm>;
  }

  // --- Kennzahlen ----------------------------------------------------------
  const offeneAntraege = d.antraege.wert ?? 0;
  const plaetze = d.plaetze.wert ?? [];
  const belegung = d.plan.wert ?? [];
  const buchungen = belegung.filter((b) => b.kind === "booking");
  const gebuchtePlaetze = new Set(buchungen.map((b) => b.court_id)).size;
  const forderungen = d.forderungen.wert ?? [];
  const offenSumme = forderungen.reduce((s, f) => s + f.amount_cents, 0);

  // --- Der Weg des Geldes --------------------------------------------------
  const lauf = d.lauf;
  const unterwegs = forderungen.filter((f) => f.status !== "returned");
  const angekuendigt = unterwegs.filter((f) => f.status === "notified");
  const faellig = angekuendigt.reduce<string | null>(
    (max, f) => (f.due_date && (!max || f.due_date > max) ? f.due_date : max),
    null,
  );
  const weg = debitFlow({
    charges: {
      payers: new Set(unterwegs.map((f) => f.payer_id)).size,
      totalCents: unterwegs.reduce((s, f) => s + f.amount_cents, 0),
      unannounced: unterwegs.filter((f) => f.status === "open").length,
      dueDate: faellig,
    },
    batch: lauf
      ? {
          status: lauf.status as DebitBatchStatus,
          collectionDate: lauf.collection_date,
          itemCount: lauf.item_count,
          readyPayers: d.einzugsfaehig,
          returned: lauf.zurueck,
        }
      : null,
    today: d.heute,
  });
  const laufHref = lauf ? `/admin/kasse/lastschriften/${lauf.id}` : "/admin/kasse?abschnitt=lastschrift";

  // --- Heute zu tun --------------------------------------------------------
  const aufgaben = adminTodos({
    today: d.heute,
    openApplications: offeneAntraege,
    noticeDueDate: faellig,
    batchHref: laufHref,
    returnedCharges: forderungen.filter((f) => f.status === "returned").length,
    openDrinkMonths: d.monate.wert ?? [],
  });
  const aufgabenFehler = d.antraege.fehler ?? d.forderungen.fehler ?? d.monate.fehler;

  // --- Die Anlage heute ----------------------------------------------------
  const einstellungen = d.einstellungen.wert?.[0];
  const auf = timeToMinutes(String(einstellungen?.opening_time ?? "08:00"));
  const zu = timeToMinutes(String(einstellungen?.closing_time ?? "21:00"));
  const jetzt = timelinePosition(localMinutes(new Date()), auf, zu);
  const anlageFehler = d.plaetze.fehler ?? d.plan.fehler ?? d.einstellungen.fehler;

  const erste = aufgaben[0]?.urgent ? aufgaben[0] : null;
  const weitere = erste ? aufgaben.slice(1) : aufgaben;
  const nr = weg.steps.findIndex((x) => x.state === "aktuell") + 1;
  const aktuellerSchritt = weg.steps[nr - 1];
  const geh = (webHref: string) => router.push(appPfad(webHref) as Href);

  return (
    <Bildschirm
      kopf={kopf}
      aktualisiert={zustand.aktualisiert}
      onAktualisieren={zustand.neuLaden}
      fehler={zustand.fehler}
    >
      {/* --- Heute zu tun ------------------------------------------------- */}
      <Abschnitt>
        <Gruppenkopf titel="Heute zu tun" neben={aufgaben.length > 0 ? `${aufgaben.length} offen` : undefined} />
        {aufgabenFehler ? (
          <Text style={stil.hinweisFehler}>Die offenen Punkte konnten nicht geladen werden.</Text>
        ) : aufgaben.length === 0 ? (
          <ListenGruppe>
            <Listenzeile punkt="info" titel="Alles erledigt" kontext="Heute liegt nichts an." />
          </ListenGruppe>
        ) : (
          <>
            {erste && (
              <View
                style={{
                  overflow: "hidden", minHeight: 196, gap: 6, padding: 20, borderRadius: 26,
                  backgroundColor: farben.brand,
                }}
              >
                <Svg width={350} height={196} viewBox="0 0 350 196" style={{ position: "absolute", right: 0, top: 0 }}>
                  <Path
                    d="M170 196 L225 0 M350 55 L225 196 M200 95 H350 M218 36 H350"
                    stroke="rgba(255,255,255,.13)"
                    strokeWidth={2}
                    fill="none"
                  />
                </Svg>
                <Text style={[stil.kicker, { color: "#fff", opacity: 0.85 }]}>Zuerst</Text>
                <Text style={{ fontSize: 28, lineHeight: 30, fontFamily: "Barlow_800ExtraBold", color: "#fff", letterSpacing: -0.4 }}>
                  {erste.title}
                </Text>
                <Text style={{ fontSize: 14.5, color: "#fff", opacity: 0.9, fontFamily: "Barlow_400Regular" }}>
                  {erste.text}
                </Text>
                <View style={{ marginTop: "auto", paddingTop: 10, alignSelf: "flex-start" }}>
                  <Knopf art="gold" text={erste.action} onPress={() => geh(erste.href)} />
                </View>
              </View>
            )}
            {weitere.length > 0 && (
              <ListenGruppe>
                {weitere.map((x) => (
                  <Listenzeile
                    key={x.key}
                    href={appPfad(x.href)}
                    punkt={x.urgent ? "dringend" : "info"}
                    titel={x.title}
                    kontext={x.text}
                    hinweis={x.action}
                    hinweisTon="blau"
                  />
                ))}
              </ListenGruppe>
            )}
          </>
        )}
      </Abschnitt>

      {/* --- Beitragslauf -------------------------------------------------- */}
      <Abschnitt>
        <Gruppenkopf
          titel={lauf ? lauf.title : "Beitragslauf"}
          neben={lauf ? "Öffnen" : "Läufe"}
          onNeben={() => geh(laufHref)}
        />
        {d.forderungen.fehler || d.laeufe.fehler ? (
          <Text style={stil.hinweisFehler}>Der Stand der Lastschrift konnte nicht geladen werden.</Text>
        ) : (
          <Pressable
            onPress={() => geh(laufHref)}
            accessibilityRole="link"
            style={({ pressed }) => [stil.karte, { gap: 10, padding: 16 }, pressed && { borderColor: farben.line2 }]}
          >
            <GeldwegBalken schritte={weg.steps} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <Text style={{ flex: 1, fontSize: 15.5, fontFamily: "Barlow_700Bold", color: farben.ink }}>
                {nr > 0 ? `Schritt ${nr} von 5 · ${aktuellerSchritt!.name}` : "Alle Schritte erledigt"}
              </Text>
              <Statusmarke text={weg.label} ton={weg.current === null ? "gruen" : "gelb"} />
            </View>
            <Text style={{ fontSize: 13, color: farben.muted, fontFamily: "Barlow_400Regular" }}>
              {[aktuellerSchritt?.info, weg.steps[0]!.info].filter(Boolean).join(" · ")}
            </Text>
          </Pressable>
        )}
      </Abschnitt>

      {/* --- Auf einen Blick ----------------------------------------------- */}
      <Abschnitt>
        <Gruppenkopf titel="Auf einen Blick" />
        <Kennzahlen>
          <Kennzahl
            label="Mitglieder"
            wert={d.mitglieder.fehler ? "–" : String(d.mitglieder.wert)}
            info="aktiv"
            href="/verwaltung/mitglieder"
          />
          <Kennzahl
            label="Heute gebucht"
            wert={d.plan.fehler ? "–" : String(buchungen.length)}
            info={`auf ${gebuchtePlaetze} von ${plaetze.length} Plätzen`}
            href="/plaetze"
          />
          <Kennzahl
            label="Offen"
            wert={d.forderungen.fehler ? "–" : formatCents(offenSumme)}
            info="alle Forderungen"
            href="/verwaltung/kasse?abschnitt=forderungen"
          />
          <Kennzahl
            label="Anträge"
            wert={d.antraege.fehler ? "–" : String(offeneAntraege)}
            info={offeneAntraege === 0 ? "nichts zu prüfen" : "warten auf Prüfung"}
            href="/verwaltung/mitglieder/antraege"
          />
        </Kennzahlen>
      </Abschnitt>

      {/* --- Heute auf der Anlage ------------------------------------------ */}
      <Abschnitt>
        <Gruppenkopf titel="Heute auf der Anlage" neben="Plan" onNeben={() => router.navigate("/plaetze")} />
        <View style={stil.karte}>
          {anlageFehler ? (
            <Text style={stil.hinweisFehler}>Die Belegung konnte nicht geladen werden.</Text>
          ) : (
            plaetze.map((p) => (
              <View key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 }}>
                <Text numberOfLines={1} style={{ width: 72, fontSize: 14, fontFamily: "Barlow_600SemiBold", color: farben.ink2 }}>
                  {p.name}
                </Text>
                <View style={{ flex: 1 }}>
                  <MiniZeitleiste
                    segmente={timelineSegments(belegung.filter((b) => b.court_id === p.id), auf, zu)}
                    markierung={jetzt}
                    hoehe={10}
                    ueberstand={3}
                  />
                </View>
              </View>
            ))
          )}
        </View>
      </Abschnitt>

      {/* --- Bereiche ----------------------------------------------------- */}
      <Abschnitt>
        <Gruppenkopf titel="Bereiche" />
        <ListenGruppe>
          {BEREICHE.map((b) => (
            <Listenzeile
              key={b.href}
              href={b.href}
              symbol={<Symbol name={b.symbol} farbe={farben.ink2} groesse={20} />}
              titel={b.label}
              hinweis={b.href === "/verwaltung/mitglieder" && offeneAntraege > 0 ? `${offeneAntraege} Anträge` : undefined}
              hinweisTon="gold"
            />
          ))}
        </ListenGruppe>
      </Abschnitt>
    </Bildschirm>
  );
}
