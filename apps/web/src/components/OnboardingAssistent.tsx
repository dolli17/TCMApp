"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  isValidIban,
  mandatstext,
  normalizeIban,
  type OnboardingSchritt,
  type OnboardingSchrittKey,
  type OnboardingZustand,
} from "@tcm/core";
import {
  buchungsmailsSpeichern,
  dokumenteAkzeptieren,
  einwilligungenSpeichern,
  erziehungsberechtigteSpeichern,
  mandatErteilen,
  notfallkontaktSpeichern,
  onboardingAbschliessen,
  stammdatenSpeichern,
  tennisSpeichern,
  type AktionsErgebnis,
} from "@/app/onboarding/aktionen";
import { AbmeldeKnopf } from "@/components/AbmeldeKnopf";
import { AnmeldeBuehne } from "@/components/AnmeldeBuehne";

type Schritt = OnboardingSchritt & { erreichbar: boolean };

const DOKUMENT_PFAD: Record<string, string> = {
  satzung: "/satzung",
  beitragsordnung: "/beitragsordnung",
  datenschutz: "/datenschutz",
};

const BUCHUNGSMAIL: { wert: string; label: string }[] = [
  { wert: "alle", label: "Alle Benachrichtigungen" },
  { wert: "wichtige", label: "Nur Wichtiges" },
  { wert: "keine", label: "Keine E-Mails" },
];

/**
 * Der Assistent des Onboardings (Seite app/onboarding).
 *
 * Jeder Schritt speichert für sich über seine RPC und geht dann zum nächsten.
 * Mit dem SEPA-Mandat schließt der Assistent das Onboarding ab
 * (complete_onboarding). Danach kommen die freiwilligen Schritte, die sich
 * überspringen lassen, und am Ende geht es in die App.
 */
export function OnboardingAssistent({
  zustand,
  schritte,
  aktuell,
}: {
  zustand: OnboardingZustand;
  schritte: Schritt[];
  aktuell: OnboardingSchrittKey;
}) {
  const router = useRouter();
  const [meldung, setMeldung] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  const index = schritte.findIndex((s) => s.key === aktuell);
  const schritt = schritte[index]!;
  const naechster = schritte[index + 1]?.key ?? null;
  const abgeschlossen = Boolean(zustand.abgeschlossen_am);
  const name = `${zustand.stammdaten.first_name} ${zustand.stammdaten.last_name}`.trim();

  function weiter(ziel: OnboardingSchrittKey | null = naechster) {
    if (ziel) router.push(`/onboarding?schritt=${ziel}`);
    else router.push("/");
    router.refresh();
  }

  /** Speichern, bei Erfolg weiter; sonst die Meldung zeigen. */
  function speichere(aktion: () => Promise<AktionsErgebnis>, ziel: OnboardingSchrittKey | null = naechster) {
    setMeldung(null);
    starte(async () => {
      const e = await aktion();
      if (!e.ok) {
        setMeldung(e.meldung);
        return;
      }
      weiter(ziel);
    });
  }

  const pflichtSchritte = schritte.filter((s) => !["einwilligungen", "tennis", "einstellungen"].includes(s.key));
  const sichtbar = abgeschlossen ? schritte.filter((s) => !pflichtSchritte.includes(s)) : pflichtSchritte;
  const position = sichtbar.findIndex((s) => s.key === aktuell) + 1;

  const unterzeile = zustand.minderjaehrig
    ? `Du richtest das Konto für ${name} ein.`
    : abgeschlossen
      ? "Freiwillig – du kannst jeden Schritt überspringen."
      : "Ein paar Angaben, dann kannst du loslegen.";

  return (
    <AnmeldeBuehne titel={`${schritt.titel}.`} unterzeile={unterzeile} breit>
      <div className="onboarding-kopf">
        <span className="kicker">
          {abgeschlossen ? "Optional" : "Konto einrichten"} · Schritt {position} von {sichtbar.length}
        </span>
        <AbmeldeKnopf alsText />
      </div>

      <ol className="onboarding-schritte" aria-label="Fortschritt">
        {sichtbar.map((s) => {
          const klasse = s.key === aktuell ? "aktuell" : s.erledigt ? "erledigt" : "";
          const inhalt = (
            <>
              <span className="punkt" aria-hidden="true">{s.erledigt && s.key !== aktuell ? "✓" : ""}</span>
              {s.titel}
              {!s.pflicht && <small> (optional)</small>}
            </>
          );
          return (
            <li key={s.key} className={klasse} aria-current={s.key === aktuell ? "step" : undefined}>
              {s.erreichbar && s.key !== aktuell ? (
                <Link href={`/onboarding?schritt=${s.key}`}>{inhalt}</Link>
              ) : (
                <span>{inhalt}</span>
              )}
            </li>
          );
        })}
      </ol>

      {meldung && (
        <div className="hinweis fehler" role="alert">
          {meldung}
        </div>
      )}

      {aktuell === "stammdaten" && (
        <Stammdaten zustand={zustand} laeuft={laeuft} speichere={(d) => speichere(() => stammdatenSpeichern(d))} />
      )}
      {aktuell === "rechtliches" && (
        <Rechtliches zustand={zustand} laeuft={laeuft} speichere={(c) => speichere(() => dokumenteAkzeptieren(c))} />
      )}
      {aktuell === "erziehungsberechtigte" && (
        <Erziehungsberechtigte
          zustand={zustand}
          laeuft={laeuft}
          speichere={(d) => speichere(() => erziehungsberechtigteSpeichern(d))}
        />
      )}
      {aktuell === "notfallkontakt" && (
        <Notfallkontakt
          zustand={zustand}
          laeuft={laeuft}
          pflicht={schritt.pflicht}
          speichere={(d) => speichere(() => notfallkontaktSpeichern(d))}
          ueberspringen={() => weiter()}
        />
      )}
      {aktuell === "sepa" && (
        <Mandat
          zustand={zustand}
          laeuft={laeuft}
          erteilen={(d) => speichere(() => mandatErteilen(d), "einwilligungen")}
          abschliessen={() => speichere(onboardingAbschliessen, "einwilligungen")}
        />
      )}
      {aktuell === "einwilligungen" && (
        <Einwilligungen
          zustand={zustand}
          laeuft={laeuft}
          speichere={(g, a) => speichere(() => einwilligungenSpeichern(g, a))}
          ueberspringen={() => weiter()}
        />
      )}
      {aktuell === "tennis" && (
        <Tennis
          zustand={zustand}
          laeuft={laeuft}
          speichere={(d) => speichere(() => tennisSpeichern(d))}
          ueberspringen={() => weiter()}
        />
      )}
      {aktuell === "einstellungen" && (
        <Einstellungen
          zustand={zustand}
          laeuft={laeuft}
          speichere={(w) => speichere(() => buchungsmailsSpeichern(w, zustand.einstellungen.booking_mail), null)}
          ueberspringen={() => weiter(null)}
        />
      )}

      <p className="beschreibung" style={{ marginTop: 24 }}>
        <Link href="/datenschutz">Datenschutz</Link> · <Link href="/impressum">Impressum</Link>
      </p>
    </AnmeldeBuehne>
  );
}

// ---------------------------------------------------------------------------
// Die Schritte
// ---------------------------------------------------------------------------

interface SchrittProps {
  zustand: OnboardingZustand;
  laeuft: boolean;
}

/** Ein Formular, das nicht neu lädt, sondern die Aktion aufruft. */
function Formular({ onSubmit, children }: { onSubmit: () => void; children: React.ReactNode }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {children}
    </form>
  );
}

function Feld({
  label,
  beschreibung,
  ...rest
}: { label: string; beschreibung?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label>
      <span>{label}</span>
      <input {...rest} />
      {beschreibung && <span className="beschreibung">{beschreibung}</span>}
    </label>
  );
}

function Knoepfe({
  laeuft,
  text,
  ueberspringen,
  deaktiviert = false,
}: {
  laeuft: boolean;
  text: string;
  ueberspringen?: () => void;
  deaktiviert?: boolean;
}) {
  return (
    <div className="onboarding-knoepfe">
      <button className="knopf gold block" disabled={laeuft || deaktiviert}>
        {laeuft ? "Wird gespeichert…" : text}
      </button>
      {ueberspringen && (
        <button type="button" className="knopf leise block" disabled={laeuft} onClick={ueberspringen}>
          Überspringen
        </button>
      )}
    </div>
  );
}

function Stammdaten({
  zustand,
  laeuft,
  speichere,
}: SchrittProps & { speichere: (d: Parameters<typeof stammdatenSpeichern>[0]) => void }) {
  const s = zustand.stammdaten;
  const [d, setD] = useState({
    first_name: s.first_name ?? "",
    last_name: s.last_name ?? "",
    birthday: s.birthday ?? "",
    gender: s.gender ?? "",
    phone: s.phone ?? "",
    mobile: s.mobile ?? "",
    street: s.street ?? "",
    postcode: s.postcode ?? "",
    city: s.city ?? "",
  });
  const feld = (k: keyof typeof d) => ({
    value: d[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setD({ ...d, [k]: e.target.value }),
  });

  return (
    <Formular onSubmit={() => speichere(d)}>
      <p className="unterzeile">
        So hat der Verein {zustand.minderjaehrig ? "die Daten" : "deine Daten"} erfasst. Bitte prüfen und
        bei Bedarf korrigieren.
      </p>
      <div className="formraster">
        <Feld label="Vorname" required autoComplete="given-name" {...feld("first_name")} />
        <Feld label="Nachname" required autoComplete="family-name" {...feld("last_name")} />
        <Feld label="Geburtstag" type="date" required {...feld("birthday")} />
        <label>
          <span>Geschlecht</span>
          <select required {...feld("gender")}>
            <option value="" disabled>
              Bitte wählen
            </option>
            <option value="female">weiblich</option>
            <option value="male">männlich</option>
            <option value="diverse">divers</option>
          </select>
        </label>
        <Feld label="Mobil" type="tel" autoComplete="tel" {...feld("mobile")} />
        <Feld label="Festnetz" type="tel" {...feld("phone")} beschreibung="Eine der beiden Nummern genügt." />
        <Feld label="Straße und Hausnummer" required autoComplete="street-address" {...feld("street")} />
        <Feld label="PLZ" required autoComplete="postal-code" inputMode="numeric" {...feld("postcode")} />
        <Feld label="Ort" required autoComplete="address-level2" {...feld("city")} />
        <label>
          <span>E-Mail</span>
          <input value={s.email ?? ""} readOnly aria-readonly="true" />
          <span className="beschreibung">Mit dieser Adresse meldest du dich an. Ändern kann sie der Vorstand.</span>
        </label>
      </div>
      <Knoepfe laeuft={laeuft} text="Daten bestätigen" />
    </Formular>
  );
}

function Rechtliches({ zustand, laeuft, speichere }: SchrittProps & { speichere: (codes: string[]) => void }) {
  const [gewaehlt, setGewaehlt] = useState<string[]>(
    zustand.dokumente.filter((d) => d.zugestimmt_am).map((d) => d.code),
  );
  const alle = zustand.dokumente.every((d) => gewaehlt.includes(d.code));

  return (
    <Formular onSubmit={() => speichere(gewaehlt)}>
      <p className="unterzeile">
        Die Texte öffnen sich in einem neuen Tab. Gespeichert wird, welcher Fassung du wann zugestimmt hast.
      </p>
      {zustand.dokumente.map((d) => {
        const link = (
          <a href={DOKUMENT_PFAD[d.code]} target="_blank" rel="noreferrer">
            {d.title}
          </a>
        );
        return (
          <label key={d.code} className="schalter">
            <input
              type="checkbox"
              checked={gewaehlt.includes(d.code)}
              disabled={Boolean(d.zugestimmt_am)}
              onChange={(e) =>
                setGewaehlt(e.target.checked ? [...gewaehlt, d.code] : gewaehlt.filter((c) => c !== d.code))
              }
            />
            <span>
              {d.code === "datenschutz" ? (
                <>Ich habe die {link} zur Kenntnis genommen.</>
              ) : (
                <>Ich akzeptiere die {link}.</>
              )}
              <small>Version {d.version}</small>
            </span>
          </label>
        );
      })}
      <Knoepfe laeuft={laeuft} text="Zustimmen und weiter" deaktiviert={!alle} />
    </Formular>
  );
}

function Erziehungsberechtigte({
  zustand,
  laeuft,
  speichere,
}: SchrittProps & { speichere: (d: Parameters<typeof erziehungsberechtigteSpeichern>[0]) => void }) {
  const e = zustand.erziehungsberechtigte;
  const [d, setD] = useState({
    name: e.name ?? "",
    email: e.email ?? "",
    phone: e.phone ?? "",
    zustimmung: Boolean(e.zustimmung_am),
  });

  return (
    <Formular onSubmit={() => speichere(d)}>
      <p className="unterzeile">
        {zustand.stammdaten.first_name} ist noch minderjährig. Wir brauchen deshalb eine erziehungsberechtigte
        Person und ihre Zustimmung zur Mitgliedschaft.
      </p>
      <Feld label="Name der/des Erziehungsberechtigten" required value={d.name} onChange={(x) => setD({ ...d, name: x.target.value })} />
      <Feld label="E-Mail der/des Erziehungsberechtigten" type="email" value={d.email} onChange={(x) => setD({ ...d, email: x.target.value })} />
      <Feld
        label="Telefon der/des Erziehungsberechtigten"
        type="tel"
        value={d.phone}
        onChange={(x) => setD({ ...d, phone: x.target.value })}
        beschreibung="E-Mail oder Telefon, besser beides."
      />
      <label className="schalter">
        <input type="checkbox" checked={d.zustimmung} onChange={(x) => setD({ ...d, zustimmung: x.target.checked })} />
        <span>
          Als Erziehungsberechtigte/r stimme ich der Mitgliedschaft von {zustand.stammdaten.first_name} im TC
          Muckensturm zu.
        </span>
      </label>
      <Knoepfe laeuft={laeuft} text="Speichern und weiter" />
    </Formular>
  );
}

function Notfallkontakt({
  zustand,
  laeuft,
  pflicht,
  speichere,
  ueberspringen,
}: SchrittProps & {
  pflicht: boolean;
  speichere: (d: Parameters<typeof notfallkontaktSpeichern>[0]) => void;
  ueberspringen: () => void;
}) {
  const n = zustand.notfallkontakt;
  const g = zustand.erziehungsberechtigte;
  // Bei Kindern mit den Erziehungsberechtigten vorbelegt, solange nichts eingetragen ist.
  const vorbelegt = zustand.minderjaehrig && !n.name && Boolean(g.name);
  const [d, setD] = useState({
    name: (vorbelegt ? g.name : n.name) ?? "",
    phone: (vorbelegt ? g.phone : n.phone) ?? "",
    relation: (vorbelegt ? "Erziehungsberechtigte/r" : n.relation) ?? "",
  });

  return (
    <Formular onSubmit={() => speichere(d)}>
      <p className="unterzeile">
        Wen rufen wir an, wenn auf der Anlage etwas passiert?
        {pflicht ? " Bei Minderjährigen ist das Pflicht." : " Freiwillig, aber hilfreich."}
      </p>
      {vorbelegt && <p className="beschreibung">Vorbelegt mit den Erziehungsberechtigten – gern ändern.</p>}
      <Feld label="Name" required={pflicht} value={d.name} onChange={(x) => setD({ ...d, name: x.target.value })} />
      <Feld label="Telefon" type="tel" required={pflicht} value={d.phone} onChange={(x) => setD({ ...d, phone: x.target.value })} />
      <Feld label="Beziehung" value={d.relation} onChange={(x) => setD({ ...d, relation: x.target.value })} placeholder="z. B. Mutter, Partner" />
      <Knoepfe laeuft={laeuft} text="Speichern und weiter" ueberspringen={pflicht ? undefined : ueberspringen} />
    </Formular>
  );
}

function Mandat({
  zustand,
  laeuft,
  erteilen,
  abschliessen,
}: SchrittProps & {
  erteilen: (d: Parameters<typeof mandatErteilen>[0]) => void;
  abschliessen: () => void;
}) {
  const m = zustand.mandat;
  const [iban, setIban] = useState("");
  const [geprueft, setGeprueft] = useState(false);
  const [kontoinhaber, setKontoinhaber] = useState(m.kontoinhaber_vorschlag ?? "");
  const [bestaetigt, setBestaetigt] = useState(false);
  const beitrag = zustand.beitragsarten.map((b) => b.name).join(" + ");

  if (m.vorhanden) {
    return (
      <Formular onSubmit={abschliessen}>
        <div className="hinweis erfolg">
          Für dich liegt bereits ein SEPA-Lastschriftmandat vor (Referenz {m.referenz}).
        </div>
        <Knoepfe laeuft={laeuft} text="Einrichtung abschließen" />
      </Formular>
    );
  }

  if (!m.moeglich) {
    return (
      <div className="hinweis fehler">
        Die Gläubigerdaten des Vereins fehlen noch, deshalb lässt sich das Mandat gerade nicht erteilen. Bitte
        wende dich an den Vorstand.
      </div>
    );
  }

  const ibanOk = isValidIban(iban);
  const text = mandatstext({ glaeubigerName: m.glaeubiger_name, glaeubigerId: m.glaeubiger_id, referenz: m.referenz });

  return (
    <Formular onSubmit={() => erteilen({ iban: normalizeIban(iban), kontoinhaber, bestaetigt })}>
      <p className="unterzeile">
        Beiträge und Getränke zieht der Verein per Lastschrift ein. Eine Überweisung gibt es nicht.
      </p>
      <dl className="gruppe angaben">
        <div>
          <dt>Beitragsart</dt>
          <dd>{beitrag || "legt der Vorstand fest"}</dd>
        </div>
      </dl>
      <Feld
        label="Kontoinhaber"
        required
        maxLength={70}
        autoComplete="name"
        value={kontoinhaber}
        onChange={(e) => setKontoinhaber(e.target.value)}
        beschreibung={
          zustand.minderjaehrig ? "Name des Elternteils, dem das Konto gehört." : "So, wie er bei der Bank steht."
        }
      />
      <label>
        <span>IBAN</span>
        <input
          required
          value={iban}
          onChange={(e) => setIban(e.target.value)}
          onBlur={() => setGeprueft(true)}
          autoComplete="off"
          spellCheck={false}
          placeholder="DE00 0000 0000 0000 0000 00"
          aria-invalid={geprueft && iban !== "" && !ibanOk}
        />
        {geprueft && iban !== "" && !ibanOk && (
          <span className="beschreibung fehlertext">Diese IBAN ist nicht gültig. Bitte die Ziffern prüfen.</span>
        )}
      </label>
      <pre className="mandatstext" aria-label="Mandatstext">
        {text}
      </pre>
      <label className="schalter">
        <input type="checkbox" checked={bestaetigt} onChange={(e) => setBestaetigt(e.target.checked)} />
        <span>
          Ich erteile dieses SEPA-Lastschriftmandat
          {zustand.minderjaehrig ? " als Kontoinhaber/in." : "."}
        </span>
      </label>
      <Knoepfe
        laeuft={laeuft}
        text="Mandat erteilen und Konto freischalten"
        deaktiviert={!ibanOk || !bestaetigt || !kontoinhaber.trim()}
      />
    </Formular>
  );
}

function Einwilligungen({
  zustand,
  laeuft,
  speichere,
  ueberspringen,
}: SchrittProps & { speichere: (gewaehlt: string[], angeboten: string[]) => void; ueberspringen: () => void }) {
  // Nichts vorausgewählt: freiwillig heißt, man muss es selbst ankreuzen.
  const [gewaehlt, setGewaehlt] = useState<string[]>(zustand.merkmale.filter((m) => m.gesetzt).map((m) => m.code));
  return (
    <Formular onSubmit={() => speichere(gewaehlt, zustand.merkmale.map((m) => m.code))}>
      <p className="unterzeile">Alles freiwillig. Du kannst es jederzeit im Konto unter „Einwilligungen“ ändern.</p>
      {zustand.merkmale.map((m) => (
        <label key={m.code} className="schalter">
          <input
            type="checkbox"
            checked={gewaehlt.includes(m.code)}
            onChange={(e) => setGewaehlt(e.target.checked ? [...gewaehlt, m.code] : gewaehlt.filter((c) => c !== m.code))}
          />
          <span>
            {m.name}
            {m.description && <small>{m.description}</small>}
          </span>
        </label>
      ))}
      <Knoepfe laeuft={laeuft} text="Speichern und weiter" ueberspringen={ueberspringen} />
    </Formular>
  );
}

function Tennis({
  zustand,
  laeuft,
  speichere,
  ueberspringen,
}: SchrittProps & { speichere: (d: Parameters<typeof tennisSpeichern>[0]) => void; ueberspringen: () => void }) {
  const t = zustand.tennis;
  const [d, setD] = useState({
    tennis_lk: t.tennis_lk ?? "",
    nuliga_id: t.nuliga_id ?? "",
    mannschaft_interesse: t.mannschaft_interesse,
  });
  return (
    <Formular onSubmit={() => speichere(d)}>
      <p className="unterzeile">Hilft dem Sportwart bei Mannschaften und Turnieren.</p>
      <Feld label="Leistungsklasse (LK)" maxLength={20} value={d.tennis_lk} onChange={(e) => setD({ ...d, tennis_lk: e.target.value })} placeholder="z. B. 18,4" />
      <Feld label="nuLiga-ID" maxLength={40} value={d.nuliga_id} onChange={(e) => setD({ ...d, nuliga_id: e.target.value })} />
      <label className="schalter">
        <input
          type="checkbox"
          checked={d.mannschaft_interesse}
          onChange={(e) => setD({ ...d, mannschaft_interesse: e.target.checked })}
        />
        <span>
          Ich habe Interesse an einer Mannschaft
          <small>Der Sportwart meldet sich bei dir.</small>
        </span>
      </label>
      <Knoepfe laeuft={laeuft} text="Speichern und weiter" ueberspringen={ueberspringen} />
    </Formular>
  );
}

function Einstellungen({
  zustand,
  laeuft,
  speichere,
  ueberspringen,
}: SchrittProps & { speichere: (wert: string) => void; ueberspringen: () => void }) {
  const [wert, setWert] = useState(zustand.einstellungen.booking_mail ?? "alle");
  return (
    <Formular onSubmit={() => speichere(wert)}>
      <label>
        <span>E-Mails zu Buchungen</span>
        <select value={wert} onChange={(e) => setWert(e.target.value)}>
          {BUCHUNGSMAIL.map((b) => (
            <option key={b.wert} value={b.wert}>
              {b.label}
            </option>
          ))}
        </select>
        <span className="beschreibung">Etwa wenn ein Platz gesperrt oder du aus einem Spiel ausgetragen wirst.</span>
      </label>
      <p className="beschreibung">
        Push-Nachrichten schaltest du in der App unter „Konto“ ein, sobald du dich dort anmeldest.
      </p>
      <Knoepfe laeuft={laeuft} text="Speichern und loslegen" ueberspringen={ueberspringen} />
    </Formular>
  );
}
