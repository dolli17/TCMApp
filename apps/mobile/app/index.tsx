import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Link } from "expo-router";
import { supabase } from "@/lib/supabase";
import { abmelden, anmelden, zaehleUngelesen } from "@/lib/daten";
import { useTheme } from "@/lib/theme";

export default function Start() {
  const { stil, farben } = useTheme();
  const [pruefeSitzung, setPruefeSitzung] = useState(true);
  const [angemeldet, setAngemeldet] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAngemeldet(Boolean(data.session));
      setPruefeSitzung(false);
    });

    const { data: abo } = supabase.auth.onAuthStateChange((_ereignis, sitzung) => {
      setAngemeldet(Boolean(sitzung));
    });

    return () => abo.subscription.unsubscribe();
  }, []);

  if (pruefeSitzung) {
    return (
      <View style={[stil.seite, { justifyContent: "center" }]}>
        <ActivityIndicator color={farben.blue} />
      </View>
    );
  }

  return angemeldet ? <Uebersicht onAbmelden={() => setAngemeldet(false)} /> : <Anmeldung />;
}

function Anmeldung() {
  const { stil } = useTheme();
  const [email, setEmail] = useState("");
  const [passwort, setPasswort] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  async function absenden() {
    setFehler(null);
    setLaeuft(true);
    const ergebnis = await anmelden(email, passwort);
    if (!ergebnis.ok) setFehler(ergebnis.meldung);
    setLaeuft(false);
  }

  return (
    <ScrollView style={stil.seite} contentContainerStyle={[stil.inhalt, { paddingTop: 48 }]}>
      <Text style={stil.titel}>TC Muckensturm</Text>
      <Text style={stil.unterzeile}>Platzbuchung, Getränke und Beiträge.</Text>

      <View style={[stil.karte, { marginTop: 16 }]}>
        <Text style={stil.leise}>E-Mail</Text>
        <TextInput
          style={stil.feld}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          textContentType="username"
          accessibilityLabel="E-Mail"
        />

        <Text style={stil.leise}>Passwort</Text>
        <TextInput
          style={stil.feld}
          value={passwort}
          onChangeText={setPasswort}
          secureTextEntry
          textContentType="password"
          accessibilityLabel="Passwort"
        />

        {fehler && <Text style={stil.hinweisFehler}>{fehler}</Text>}

        <Pressable
          style={stil.knopf}
          onPress={absenden}
          disabled={laeuft}
          accessibilityRole="button"
        >
          <Text style={stil.knopfText}>{laeuft ? "Anmelden…" : "Anmelden"}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function Uebersicht({ onAbmelden }: { onAbmelden: () => void }) {
  const { stil, farben } = useTheme();
  const [ungelesen, setUngelesen] = useState(0);

  // Nur die Zahl, nicht die Liste: die steht einen Bildschirm weiter, und ein
  // Zaehler ueber den Teilindex kostet praktisch nichts.
  useEffect(() => {
    zaehleUngelesen().then(setUngelesen).catch(() => {});
  }, []);

  return (
    <ScrollView style={stil.seite} contentContainerStyle={stil.inhalt}>
      <Text style={stil.titel}>Willkommen</Text>

      <Link href="/plan" asChild>
        <Pressable style={stil.karte} accessibilityRole="button">
          <Text style={{ fontWeight: "600", fontSize: 17 }}>Plätze</Text>
          <Text style={stil.leise}>Belegungsplan und Buchung</Text>
        </Pressable>
      </Link>

      <Link href="/meine" asChild>
        <Pressable style={stil.karte} accessibilityRole="button">
          <Text style={{ fontWeight: "600", fontSize: 17 }}>Meine Buchungen</Text>
          <Text style={stil.leise}>Was für dich ansteht</Text>
        </Pressable>
      </Link>

      <Link href="/offen" asChild>
        <Pressable style={stil.karte} accessibilityRole="button">
          <Text style={{ fontWeight: "600", fontSize: 17 }}>Offene Spiele</Text>
          <Text style={stil.leise}>Wer noch Mitspieler sucht</Text>
        </Pressable>
      </Link>

      <Link href="/nachrichten" asChild>
        <Pressable style={stil.karte} accessibilityRole="button">
          <View style={stil.zeile}>
            <Text style={{ fontWeight: "600", fontSize: 17 }}>Benachrichtigungen</Text>
            {ungelesen > 0 && (
              <Text
                style={{
                  backgroundColor: farben.red, color: "#fff", fontWeight: "700",
                  fontSize: 12, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99,
                  overflow: "hidden",
                }}
              >
                {ungelesen > 9 ? "9+" : ungelesen}
              </Text>
            )}
          </View>
          <Text style={stil.leise}>Änderungen an deinen Buchungen</Text>
        </Pressable>
      </Link>

      <Link href="/getraenke" asChild>
        <Pressable style={stil.karte} accessibilityRole="button">
          <Text style={{ fontWeight: "600", fontSize: 17 }}>Getränke</Text>
          <Text style={stil.leise}>Entnahme erfassen und Monatsstand</Text>
        </Pressable>
      </Link>

      <Link href="/konto" asChild>
        <Pressable style={stil.karte} accessibilityRole="button">
          <Text style={{ fontWeight: "600", fontSize: 17 }}>Mein Konto</Text>
          <Text style={stil.leise}>Forderungen, Arbeitsdienst, Erscheinungsbild</Text>
        </Pressable>
      </Link>

      <Pressable
        style={[stil.karte, { alignItems: "center" }]}
        onPress={async () => {
          await abmelden();
          onAbmelden();
        }}
        accessibilityRole="button"
      >
        <Text style={stil.leise}>Abmelden</Text>
      </Pressable>
    </ScrollView>
  );
}
