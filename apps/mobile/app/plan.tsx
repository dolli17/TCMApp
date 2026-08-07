import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, AppState, Pressable, ScrollView, Text, View } from "react-native";
import { berlinTime } from "@tcm/core";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/lib/theme";
import {
  aendereMitspieler, bucheplatz, ladeBuchungsarten, ladeBuchungseinstellungen,
  ladeIchSelbst, ladeKontingent, ladeMeineBuchungen, ladePlaetze, ladeTagesplan,
  ladeVerzeichnis, spieleMit, storniereBuchung, sucheMitspieler,
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
  const [aktiv, setAktiv] = useState(0);
  const [einstellungen, setEinstellungen] =
    useState<Awaited<ReturnType<typeof ladeBuchungseinstellungen>>>(null);
  const [admin, setAdmin] = useState(false);
  const [meineId, setMeineId] = useState<string | null>(null);
  const [fenster, setFenster] = useState<Fenster | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  const laden = useCallback(async (tag: string) => {
    setLaedt(true);
    const [p, b, k, e, a, v, ich, meine] = await Promise.all([
      ladePlaetze(), ladeTagesplan(tag), ladeKontingent(), ladeBuchungseinstellungen(),
      ladeBuchungsarten(), ladeVerzeichnis(""), ladeIchSelbst(), ladeMeineBuchungen(),
    ]);
    setPlaetze(p); setBelegung(b); setKontingent(k); setEinstellungen(e);
    setArten(a); setVerzeichnis(v); setAdmin(ich.admin); setMeineId(ich.id);

    // Bewusst nicht kontingent.used: das zaehlt nur Buchungsarten mit
    // counts_towards_quota, und solange das Kontingent auf 0 steht, sagt die
    // verbrauchte Menge ohnehin nichts. Fuer die Frage "was habe ich noch
    // vor?" ist eine Buchung eine Buchung.
    const jetzt = Date.now();
    setAktiv(meine.filter((m) => new Date(m.ends_at).getTime() > jetzt).length);

    setLaedt(false);
  }, []);

  useEffect(() => {
    laden(datum).catch((f: Error) => {
      setMeldung({ ok: false, text: f.message });
      setLaedt(false);
    });
  }, [datum, laden]);

  /**
   * Der Plan hält sich selbst aktuell.
   *
   * Zwei Dinge sind hier anders als im Web:
   *
   * Erstens geht die App in den Hintergrund. Ein Kanal, der das verschläft,
   * bleibt danach stumm - die Verbindung ist tot, aber niemand merkt es. Beim
   * Zurückkommen wird deshalb neu geladen und neu abonniert.
   *
   * Zweitens die Drosselung: eine Serienanlage mit sechzig Terminen löst
   * sechzig Ereignisse in Sekunden aus. Höchstens ein Nachladen pro Sekunde.
   */
  useEffect(() => {
    let letzte = 0;
    let wartet: ReturnType<typeof setTimeout> | null = null;

    function auffrischen() {
      const jetzt = Date.now();
      const rest = 1000 - (jetzt - letzte);
      if (rest <= 0) {
        letzte = jetzt;
        laden(datum).catch(() => {});
        return;
      }
      if (wartet) return;
      wartet = setTimeout(() => {
        wartet = null;
        letzte = Date.now();
        laden(datum).catch(() => {});
      }, rest);
    }

    const kanal = supabase
      .channel(`plan-${datum}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, auffrischen)
      .subscribe();

    const abo = AppState.addEventListener("change", (zustand) => {
      if (zustand === "active") {
        // Was während des Schlafs passiert ist, hat der Kanal nicht gesehen.
        // Die Verbindung baut Supabase selbst wieder auf; die Lücke schließt
        // dieses Nachladen.
        laden(datum).catch(() => {});
      }
    });

    return () => {
      if (wartet) clearTimeout(wartet);
      abo.remove();
      void supabase.removeChannel(kanal);
    };
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

  // Der Zeitpunkt wird in Europe/Berlin gebildet, nicht in der Zeitzone des
  // Telefons. Steht das Geraet auf einer anderen Zone - Urlaub, Dienstreise,
  // falsch gestellte Uhr -, war die abgeschickte Startzeit vorher um Stunden
  // verschoben, und die Datenbank hat sie entweder abgewiesen oder still auf
  // dem falschen Platz eingetragen.
  const zeitpunkt = useCallback(
    (minute: number) => berlinTime(datum, minute),
    [datum],
  );

  /** Kann auf diesem Platz um genau diese Minute eine Buchung beginnen? */
  const startMoeglich = useCallback(
    (courtId: string, minute: number) => {
      if (zeitpunkt(minute).getTime() < Date.now()) return false;
      if (minute + dauer > schluss) return false;
      return !belegung.some(
        (b) =>
          b.court_id === courtId &&
          lokaleMinuten(b.starts_at) < minute + dauer &&
          lokaleMinuten(b.ends_at) > minute,
      );
    },
    [belegung, dauer, schluss, zeitpunkt],
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

  /**
   * Wer darf eine bestehende Buchung anfassen?
   *
   * Neben Bucher und Admin auch jeder, dem sie offensteht: eine ausgeschriebene
   * Buchung ist eine Einladung, und die muss antippbar sein.
   */
  function verwaltbar(b: Belegung): boolean {
    if (admin) return true;
    if (b.kind !== "booking" || new Date(b.starts_at).getTime() <= Date.now()) return false;
    return b.is_own === true || (b.partner_wanted === true && b.frei > 0 && b.bin_dabei !== true);
  }

  async function buchen(
    courtId: string, start: number, typ: string, mitglieder: string[], gaeste: string[],
    sucht: boolean,
  ) {
    setLaeuft(true);
    const r = await bucheplatz(courtId, zeitpunkt(start), typ, mitglieder, gaeste, sucht);
    setLaeuft(false);
    setMeldung({ ok: r.ok, text: r.meldung });
    if (r.ok) { setFenster(null); await laden(datum); }
  }

  async function ausschreiben(bookingId: string, gesucht: boolean) {
    setLaeuft(true);
    const r = await sucheMitspieler(bookingId, gesucht);
    setLaeuft(false);
    setMeldung({ ok: r.ok, text: r.meldung });
    if (r.ok) { setFenster(null); await laden(datum); }
  }

  async function beitreten(bookingId: string) {
    setLaeuft(true);
    const r = await spieleMit(bookingId);
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
                {unbegrenzt ? aktiv : `${kontingent.used} / ${kontingent.allowed}`}
              </Text>
              <Text style={stil.heroPilleLabel}>
                {unbegrenzt
                  ? aktiv === 1
                    ? "Buchung steht an"
                    : "Buchungen stehen an"
                  : "von deinem Kontingent"}
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
            // Eine Stunde taugt, sobald darin ueberhaupt eine Startzeit frei
            // ist. Vorher wurden angebrochene Stunden ganz ausgeblendet - war
            // :00 belegt, liess sich :30 am Telefon nicht buchen, obwohl der
            // Platz frei stand. Die Marke traegt deshalb die erste freie
            // Startzeit, nicht den Stundenbeginn.
            const frei = stunden
              .map((stunde) => ({ stunde, zeiten: startzeitenIn(platz.id, stunde) }))
              .filter((s) => s.zeiten.length > 0);

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
                        {b.partner_wanted === true && b.frei > 0 && (
                          <Text style={[stil.leise, { color: farben.gold, fontWeight: "700" }]}>
                            sucht {b.frei === 1 ? "einen Mitspieler" : `${b.frei} Mitspieler`}
                          </Text>
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
                          {b.is_own === true || admin ? "Verwalten" : "Mitspielen"}
                        </Text>
                      </Pressable>
                    ) : (
                      <View key={b.booking_id} style={rahmen}>{inhalt}</View>
                    );
                  })
                )}

                {frei.length > 0 && (
                  <View style={stil.slotreihe}>
                    {frei.map(({ stunde, zeiten }) => (
                      <Pressable
                        key={stunde}
                        style={stil.slot}
                        disabled={kontingentAus}
                        accessibilityRole="button"
                        accessibilityLabel={`${platz.name} um ${alsUhrzeit(zeiten[0]!)} buchen`}
                        onPress={() =>
                          setFenster({
                            modus: "buchen", courtId: platz.id, platzName: platz.name,
                            stunde, startzeiten: zeiten,
                          })
                        }
                      >
                        <Text style={stil.slotText}>{alsUhrzeit(zeiten[0]!)}</Text>
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
          meineId={meineId}
          rasterMinuten={raster}
          anzeigeMinuten={anzeige}
          gastgebuehrCents={einstellungen?.guest_fee_cents ?? 0}
          istAdmin={admin}
          laeuft={laeuft}
          onBuchen={buchen}
          onSpeichern={speichern}
          onStornieren={stornieren}
          onAusschreiben={ausschreiben}
          onBeitreten={beitreten}
          onSchliessen={() => setFenster(null)}
        />
      )}
    </>
  );
}
