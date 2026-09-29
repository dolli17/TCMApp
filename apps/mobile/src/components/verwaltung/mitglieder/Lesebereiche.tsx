/**
 * Die Bereiche eines Mitglieds, die nur lesen: Forderungen und
 * Aenderungsprotokoll (wie Forderungen und Protokoll in
 * apps/web/src/app/admin/mitglieder/[id]/page.tsx).
 *
 * Die Tabelle des Protokolls wird am Telefon zu Zeilen: wann und wer oben,
 * darunter je geaendertem Feld alt -> neu.
 */

import { Text, View } from "react-native";
import { formatCents, isoDateLabel } from "@tcm/core";
import { Abschnitt, Gruppenkopf, LeereZeile, ListenGruppe, Listenzeile, Statusmarke } from "@/components/verwaltung/Liste";
import { FORDERUNG_STAND } from "@/components/verwaltung/mitglieder/optionen";
import { useLaden } from "@/lib/laden";
import { useTheme } from "@/lib/theme";
import { zeitstempel } from "@/lib/verwaltung/gemeinsam";
import { ladeForderungen, ladeProtokoll } from "@/lib/verwaltung/mitglieder";

export function Forderungen({ mitgliedId }: { mitgliedId: string }) {
  const { farben, stil } = useTheme();
  const zustand = useLaden(() => ladeForderungen(mitgliedId));
  const liste = zustand.daten ?? [];

  return (
    <Abschnitt>
      <Gruppenkopf titel="Forderungen" />
      {zustand.fehler ? (
        <Text style={stil.hinweisFehler}>{zustand.fehler}</Text>
      ) : zustand.laedt ? null : (
        <ListenGruppe>
          {liste.length === 0 ? (
            <LeereZeile text="Noch keine Forderung." />
          ) : (
            liste.map((f) => {
              const stand = FORDERUNG_STAND[f.status] ?? { text: f.status, ton: "grau" as const };
              return (
                <Listenzeile
                  key={f.id}
                  titel={f.description}
                  kontext={
                    [
                      f.member_id === mitgliedId ? null : `für ${f.members?.first_name ?? ""} ${f.members?.last_name ?? ""}`,
                      f.due_date ? `fällig ${isoDateLabel(f.due_date)}` : null,
                    ].filter(Boolean).join(" · ") || undefined
                  }
                  neben={
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <Text style={{ fontSize: 16, fontFamily: "BarlowSemiCondensed_700Bold", color: farben.ink, fontVariant: ["tabular-nums"] }}>
                        {formatCents(f.amount_cents)}
                      </Text>
                      <Statusmarke text={stand.text} ton={stand.ton} />
                    </View>
                  }
                />
              );
            })
          )}
        </ListenGruppe>
      )}
    </Abschnitt>
  );
}

export function Protokoll({ mitgliedId }: { mitgliedId: string }) {
  const { farben, stil } = useTheme();
  const zustand = useLaden(() => ladeProtokoll(mitgliedId));
  const eintraege = zustand.daten ?? [];

  if (zustand.fehler) return <Text style={stil.hinweisFehler}>{zustand.fehler}</Text>;
  if (zustand.laedt) return null;

  return (
    <Abschnitt>
      <Gruppenkopf titel="Änderungen" />
      <Text style={[stil.leise, { fontSize: 14, marginHorizontal: 2 }]}>
        Jede Änderung an diesem Mitglied – auch die, die es selbst vorgenommen hat.
      </Text>
      <ListenGruppe>
        {eintraege.length === 0 ? (
          <LeereZeile text="Noch keine Änderungen aufgezeichnet." />
        ) : (
          eintraege.map((e) => (
            <View key={e.id} style={{ paddingVertical: 12, paddingHorizontal: 16, gap: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <Text style={{ flex: 1, fontSize: 15.5, fontFamily: "Barlow_700Bold", color: farben.ink }}>{e.wo}</Text>
                {/* Beim Anlegen stehen saemtliche Felder im Diff - ein Satz genuegt. */}
                {e.aktion === "insert" && <Statusmarke ton="gruen" text="angelegt" />}
                {e.aktion === "delete" && <Statusmarke ton="rot" text="gelöscht" />}
              </View>
              <Text style={{ fontSize: 13, color: farben.muted, fontFamily: "Barlow_400Regular" }}>
                {zeitstempel(e.wann)} · {e.wer}
              </Text>
              {e.aenderungen.map((a) => (
                <Text key={a.feld} style={{ fontSize: 14, color: farben.ink2, fontFamily: "Barlow_400Regular", lineHeight: 19 }}>
                  <Text style={{ fontFamily: "Barlow_600SemiBold", color: farben.ink }}>{a.feld}</Text>
                  {": "}
                  <Text style={{ textDecorationLine: "line-through", color: farben.muted }}>{a.alt}</Text>
                  {" → "}
                  <Text style={{ color: farben.ink }}>{a.neu}</Text>
                </Text>
              ))}
            </View>
          ))
        )}
      </ListenGruppe>
    </Abschnitt>
  );
}
