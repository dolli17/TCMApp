/**
 * Eine Veranstaltung als Karte (Entwurf Main und Home) - wie
 * apps/web/src/components/EventKarte.tsx: Datumskachel, Art, eigener Stand,
 * Titel, Zeit und Ort, darunter Preis und Plaetze. Die Texte kommen aus
 * @tcm/core, damit Web und App dasselbe sagen.
 */

import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import {
  EVENT_KIND_LABEL, EVENT_KIND_TON, eventDatumKachel, eventKartenZeile, eventKartenZeit, eventMeineMarke,
  eventVorbei, type EventTon, type MitgliedEvent,
} from "@tcm/core";
import { radius } from "@tcm/ui";
import { mitDeckkraft } from "@/lib/stil";
import { useTheme } from "@/lib/theme";

export function EventKarte({ e, aufforderung = false }: { e: MitgliedEvent; aufforderung?: boolean }) {
  const { stil, farben } = useTheme();
  const jetzt = new Date();
  const k = eventDatumKachel(e.starts_at);
  const vorbei = eventVorbei(e, jetzt) || e.status === "cancelled";
  const marke = eventMeineMarke(e, jetzt, aufforderung);

  return (
    <Pressable
      onPress={() => router.push({ pathname: "/verein/veranstaltung/[id]", params: { id: e.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${e.title}, ${eventKartenZeit(e)}${marke ? `, ${marke.text}` : ""}`}
      style={[stil.listenkarte, { borderRadius: radius.karte, padding: 14, flexDirection: "row", gap: 14 }]}
    >
      <View
        style={{
          width: 52, height: 56, borderRadius: 14, alignItems: "center", justifyContent: "center",
          backgroundColor: vorbei ? farben.surf2 : farben.brand,
        }}
      >
        <Text style={{ fontFamily: "BarlowSemiCondensed_700Bold", fontSize: 21, color: vorbei ? farben.ink2 : farben.onBrand }}>
          {k.tag}
        </Text>
        <Text
          style={{
            fontFamily: "Barlow_700Bold", fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase",
            color: vorbei ? farben.ink2 : farben.onBrand,
          }}
        >
          {k.monat}
        </Text>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          <MarkeKlein text={EVENT_KIND_LABEL[e.kind]} ton={EVENT_KIND_TON[e.kind]} />
          {marke && <MarkeKlein text={marke.text} ton={marke.ton} />}
        </View>
        <Text style={{ fontSize: 17, fontFamily: "Barlow_700Bold", color: vorbei ? farben.ink2 : farben.ink }}>
          {e.title}
        </Text>
        <Text style={[stil.leise, { fontSize: 13.5 }]}>{eventKartenZeit(e)}</Text>
        <Text style={{ fontSize: 13.5, fontFamily: "Barlow_700Bold", color: farben.ink }}>
          {eventKartenZeile(e, jetzt)}
        </Text>
      </View>
    </Pressable>
  );
}

/** .marke-klein in den Toenen von EVENT_KIND_TON */
export function MarkeKlein({ text, ton }: { text: string; ton: EventTon }) {
  const { farben } = useTheme();
  const farbe: Record<EventTon, { bg: string; ink: string }> = {
    blau: { bg: farben.blueSoft, ink: farben.blueInk },
    gelb: { bg: farben.goldSoft, ink: farben.goldInk },
    gruen: { bg: mitDeckkraft(farben.green, 0.16), ink: farben.greenInk },
    grau: { bg: farben.chip, ink: farben.ink2 },
    rot: { bg: mitDeckkraft(farben.red, 0.14), ink: farben.redInk },
  };
  return (
    <View style={{ alignSelf: "flex-start", borderRadius: radius.chip, paddingVertical: 3, paddingHorizontal: 8, backgroundColor: farbe[ton].bg }}>
      <Text style={{ fontSize: 11, fontFamily: "Barlow_600SemiBold", color: farbe[ton].ink }}>{text}</Text>
    </View>
  );
}
