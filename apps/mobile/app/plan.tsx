import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useTheme } from "@/lib/theme";
import {
  aendereMitspieler, bucheplatz, istAdmin as ladeAdminFlag, ladeBuchungsarten,
  ladeBuchungseinstellungen, ladeKontingent, ladePlaetze, ladeTagesplan, ladeVerzeichnis,
  storniereBuchung,
} from "@/lib/daten";
import {
  alsUhrzeit, lokaleMinuten, zuMinuten,
  type Belegung, type Buchungsart, type Fenster, type Mitglied,
} from "@/lib/plan";
import { BuchungsFenster } from "@/components/BuchungsFenster";

const heuteInBerlin = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());

function verschiebe(datum: string, tage: number): string {
  const [j, m, t] = datum.split("-").map(Number);
  const d = new Date(Date.UTC(j!, (m ?? 1) - 1, t));
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

function lesbar(datum: string): string {
  const [j, m, t] = datum.split("-").map(Number);
  return new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "2-digit", month: "long" })
    .format(new Date(j!, (m ?? 1) - 1, t));
}

/**
 * Auf dem Telefon ist ein Raster mit acht Spalten unbrauchbar. Deshalb je
 * Platz eine Karte mit den Belegungen darunter - einhaendig bedienbar. Die
 * Web-App zeigt unter 768 Pixel dieselbe Form.
 *
 * Gebucht wird zur vollen oder halben Stunde, immer 60 Minuten. Die freien
 * Stunden stehen als Marken unter der Karte; die Feinwahl :00/:30 passiert im
 * Fenster, genau wie im Web.
 */
export default function Plan() {
  const { stil, farben } = useTheme();
  const [datum, setDatum] = useState(heuteInBerlin());
  const [plaetze, setPlaetze] = useState<Awaited<ReturnType<typeof ladePlaetze>>>([]);
  const [belegung, setBelegung] = useState<Belegung[]>([]);
  const [arten, setArten] = useState<Buchungsart[]>([]);
  const [verzeichnis, setVerzeichnis] = useState<Mitglied[]>([]);
  const [kontingent, setKontingent] = useState({ used: 0, allowed: 0 });
  const [einstellungen, setEinstellungen] =
    useState<Awaited<ReturnType<typeof ladeBuchungseinstellungen>>>(null);
  const [admin, setAdmin] = useState(false);
  const [fenster, setFenster] = useState<Fenster | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  const laden = useCallback(async (tag: string) => {
    setLaedt(true);
    const [p, b, k, e, a, v, ad] = await Promise.all([
      ladePlaetze(), ladeTagesplan(tag), ladeKontingent(), ladeBuchungseinstellungen(),
      ladeBuchungsarten(), ladeVerzeichnis(""), ladeAdminFlag(),
    ]);
    setPlaetze(p); setBelegung(b); setKontingent(k); setEinstellungen(e);
    setArten(a); setVerzeichnis(v); setAdmin(ad); setLaedt(false);
  }, []);

  useEffect(() => {
    laden(datum).catch((f: Error) => {
      setMeldung({ ok: false, text: f.message });
      setLaedt(false);
    });
  }, [datum, laden]);

  const oeffnung = zuMinuten(String(einstellungen?.opening_time ?? "08:00"));
  const schluss = zuMinuten(String(einstellungen?.closing_time ?? "21:00"));
  const raster = einstellungen?.slot_minutes ?? 30;
  const anzeige = einstellungen?.display_minutes ?? 60;
  const dauer = arten[0]?.duration_minutes ?? 60;
  // 0 heisst unbegrenzt - die Regel bleibt in der Datenbank, nur abgeschaltet.
  const unbegrenzt = (kontingent.allowed ?? 0) <= 0;
  const kontingentAus = !unbegrenzt && kontingent.used >= kontingent.allowed;

  const stunden = useMemo(() => {
    const out: number[] = [];
    for (let m = oeffnung; m + anzeige <= schluss; m += anzeige) out.push(m);
    return out;
  }, [oeffnung, schluss, anzeige]);

  const tagesBeginn = useMemo(() => {
    const [j, m, t] = datum.split("-").map(Number);
    return new Date(j!, (m ?? 1) - 1, t).getTime();
  }, [datum]);

  /** Kann auf diesem Platz um genau diese Minute eine Buchung beginnen? */
  const startMoeglich = useCallback(
    (courtId: string, minute: number) => {
      if (tagesBeginn + minute * 60_000 < Date.now()) return false;
      if (minute + dauer > schluss) return false;
      return !belegung.some(
        (b) =>
          b.court_id === courtId &&
          lokaleMinuten(b.starts_at) < minute + dauer &&
          lokaleMinuten(b.ends_at) > minute,
      );
    },
    [belegung, dauer, schluss, tagesBeginn],
  );

  const startzeitenIn = useCallback(
    (courtId: string, stunde: number) => {
      const out: number[] = [];
      for (let m = stunde; m < stunde + anzeige; m += raster) {
        if (startMoeglich(courtId, m)) out.push(m);
      }
      return out;
    },
    [anzeige, raster, startMoeglich],
  );

  /** Wer darf eine bestehende Buchung anfassen? */
  function verwaltbar(b: Belegung): boolean {
    if (admin) return true;
    return (
      b.is_own === true &&
      b.kind === "booking" &&
      new Date(b.starts_at).getTime() > Date.now()
    );
  }

  async function buchen(
    courtId: string, start: number, typ: string, mitglieder: string[], gaeste: string[],
  ) {
    setLaeuft(true);
    const zeitpunkt = new Date(tagesBeginn + start * 60_000);
    const r = await bucheplatz(courtId, zeitpunkt, typ, mitglieder, gaeste);
    setLaeuft(false);
    setMeldung({ ok: r.ok, text: r.meldung });
    if (r.ok) { setFenster(null); await laden(datum); }
  }

  async function speichern(bookingId: string, mitglieder: string[], gaeste: string[]) {
    setLaeuft(true);
    const r = await aendereMitspieler(bookingId, mitglieder, gaeste);
    setLaeuft(false);
    setMeldung({ ok: r.ok, text: r.meldung });
    if (r.ok) { setFenster(null); await laden(datum); }
  }

  async function stornieren(id: string) {
    setLaeuft(true);
    const r = await storniereBuchung(id);
    setLaeuft(false);
    setMeldung({ ok: r.ok, text: r.meldung });
    if (r.ok) { setFenster(null); await laden(datum); }
  }

  return (
    <>
      <ScrollView style={stil.seite} contentContainerStyle={stil.inhalt}>
        <View style={stil.hero}>
          <Text style={stil.heroKicker}>Freiplätze</Text>
          <Text style={stil.heroTitel}>{lesbar(datum)}</Text>
          <View style={stil.heroPillen}>
            <View style={stil.heroPille}>
              <Text style={stil.heroPilleWert}>
                {unbegrenzt ? kontingent.used : `${kontingent.used} / ${kontingent.allowed}`}
              </Text>
              <Text style={stil.heroPilleLabel}>
                {unbegrenzt ? "Buchungen offen" : "von deinem Kontingent"}
              </Text>
            </View>
            <View style={stil.heroPille}>
              <Text style={stil.heroPilleWert}>{plaetze.length}</Text>
              <Text style={stil.heroPilleLabel}>Plätze</Text>
            </View>
          </View>
        </View>

        <View style={stil.zeile}>
          <Pressable style={stil.knopfLeise} onPress={() => setDatum(verschiebe(datum, -1))}
            accessibilityRole="button" accessibilityLabel="Vortag">
            <Text style={stil.knopfLeiseText}>‹ Vortag</Text>
          </Pressable>
          <Pressable style={stil.knopfLeise} onPress={() => setDatum(verschiebe(datum, 1))}
            accessibilityRole="button" accessibilityLabel="Folgetag">
            <Text style={stil.knopfLeiseText}>Folgetag ›</Text>
          </Pressable>
        </View>

        {!unbegrenzt && (
          <Text style={stil.leise}>
            Buchungen, bei denen du als Mitspieler eingetragen bist, zählen mit.
          </Text>
        )}

        {meldung && (
          <Text style={meldung.ok ? stil.hinweisErfolg : stil.hinweisFehler}>{meldung.text}</Text>
        )}

        {laedt ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={farben.blue} />
        ) : (
          plaetze.map((platz) => {
            const eintraege = belegung
              .filter((b) => b.court_id === platz.id)
              .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
            const belegteStunden = new Set(
              stunden.filter((s) =>
                eintraege.some(
                  (b) => lokaleMinuten(b.starts_at) < s + anzeige && lokaleMinuten(b.ends_at) > s,
                ),
              ),
            );
            const frei = stunden.filter(
              (s) => !belegteStunden.has(s) && startzeitenIn(platz.id, s).length > 0,
            );

            return (
              <View key={platz.id} style={stil.karte}>
                <Text style={{ fontFamily: "BarlowSemiCondensed_700Bold", fontSize: 18, color: farben.ink }}>
                  {platz.name}
                </Text>

                {eintraege.length === 0 ? (
                  <Text style={stil.leise}>ganztägig frei</Text>
                ) : (
                  eintraege.map((b) => {
                    const inhalt = (
                      <>
                        <Text style={stil.text}>
                          <Text style={stil.zahl}>
                            {alsUhrzeit(lokaleMinuten(b.starts_at))}–{alsUhrzeit(lokaleMinuten(b.ends_at))}
                          </Text>
                          {"  "}
                          {b.kind === "blocking" ? b.title : b.owner_name}
                        </Text>
                        {b.players.length > 0 && (
                          <Text style={stil.leise}>mit {b.players.join(", ")}</Text>
                        )}
                      </>
                    );
                    const rahmen = [
                      stil.belegzeile,
                      b.is_own && stil.belegzeileEigen,
                      b.kind === "blocking" && stil.belegzeileBlockung,
                    ];

                    return verwaltbar(b) ? (
                      <Pressable
                        key={b.booking_id}
                        style={rahmen}
                        accessibilityRole="button"
                        accessibilityLabel={`Buchung ${alsUhrzeit(lokaleMinuten(b.starts_at))} auf ${platz.name} verwalten`}
                        onPress={() =>
                          setFenster({ modus: "verwalten", belegung: b, platzName: platz.name })
                        }
                      >
                        {inhalt}
                        <Text style={[stil.leise, { color: farben.blue, fontWeight: "600" }]}>
                          Verwalten
                        </Text>
                      </Pressable>
                    ) : (
                      <View key={b.booking_id} style={rahmen}>{inhalt}</View>
                    );
                  })
                )}

                {frei.length > 0 && (
                  <View style={stil.slotreihe}>
                    {frei.map((s) => (
                      <Pressable
                        key={s}
                        style={stil.slot}
                        disabled={kontingentAus}
                        accessibilityRole="button"
                        accessibilityLabel={`${platz.name} um ${alsUhrzeit(s)} buchen`}
                        onPress={() =>
                          setFenster({
                            modus: "buchen", courtId: platz.id, platzName: platz.name,
                            stunde: s, startzeiten: startzeitenIn(platz.id, s),
                          })
                        }
                      >
                        <Text style={stil.slotText}>{alsUhrzeit(s)}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {fenster && (
        <BuchungsFenster
          fenster={fenster}
          arten={arten}
          verzeichnis={verzeichnis}
          rasterMinuten={raster}
          anzeigeMinuten={anzeige}
          istAdmin={admin}
          laeuft={laeuft}
          onBuchen={buchen}
          onSpeichern={speichern}
          onStornieren={stornieren}
          onSchliessen={() => setFenster(null)}
        />
      )}
    </>
  );
}
