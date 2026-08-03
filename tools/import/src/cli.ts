/**
 * eBuSy-Import
 *
 * Standardmaessig ein Dry-Run: liest die API, formt um, zaehlt und meldet -
 * schreibt aber nichts. Der Schreibmodus ist bewusst noch nicht gebaut, weil
 * der Import erst zum Cutover laeuft und bis dahin kein echter Datensatz in
 * die Datenbank gehoert.
 *
 * Aufruf:
 *   pnpm --filter @tcm/import dry-run
 *
 * Zugangsdaten kommen aus der .env im Wurzelverzeichnis. Sie stehen nirgends
 * im Code.
 */

import {
  findeMailKonflikte,
  findeReferenzKonflikte,
  istMinderjaehrig,
  mapBankAccount,
  mapMandate,
  mapMembership,
  mapPerson,
  type EbusyMembership,
  type EbusyPerson,
} from "./mapping";

interface Seite<T> {
  content: T[];
  last: boolean;
  totalElements: number;
}

function umgebung(name: string): string {
  const wert = process.env[name];
  if (!wert) {
    throw new Error(
      `${name} fehlt. Die eBuSy-Zugangsdaten gehoeren in die lokale .env, ` +
        "niemals ins Repo.",
    );
  }
  return wert;
}

async function hole<T>(pfad: string): Promise<T> {
  const basis = umgebung("EBUSY_BASE_URL");
  const auth = Buffer.from(
    `${umgebung("EBUSY_USER")}:${umgebung("EBUSY_PASSWORD")}`,
  ).toString("base64");

  const antwort = await fetch(`${basis}${pfad}`, {
    headers: { Authorization: `Basic ${auth}` },
  });

  if (!antwort.ok) {
    throw new Error(`${pfad}: HTTP ${antwort.status}`);
  }

  const daten = (await antwort.json()) as { response: T; error?: string | null };
  if (daten.error) throw new Error(`${pfad}: ${daten.error}`);
  return daten.response;
}

/** Blaettert alle Seiten durch. Die API erlaubt hoechstens 100 je Abruf. */
async function holeAlle<T>(pfad: string): Promise<T[]> {
  const alle: T[] = [];
  let offset = 0;

  for (;;) {
    const trenner = pfad.includes("?") ? "&" : "?";
    const seite = await hole<Seite<T>>(`${pfad}${trenner}offset=${offset}&limit=100`);
    alle.push(...seite.content);
    if (seite.last) break;
    offset += 100;
  }

  return alle;
}

async function main() {
  const schreiben = !process.argv.includes("--dry-run");

  if (schreiben) {
    console.error(
      "Der Schreibmodus ist nicht implementiert. Der Import laeuft erst zum " +
        "Cutover, und bis dahin gehoeren keine echten Personendaten in die " +
        "Datenbank. Mit --dry-run aufrufen.",
    );
    process.exit(1);
  }

  console.warn("eBuSy-Import, Dry-Run. Es wird nichts geschrieben.\n");

  const memberModul = umgebung("EBUSY_MEMBER_MODULE_ID");

  const [personen, mitgliedschaften] = await Promise.all([
    holeAlle<EbusyPerson>("/general/persons"),
    holeAlle<EbusyMembership>(`/member/modules/${memberModul}/memberships`),
  ]);

  const mitglieder = personen.map(mapPerson);
  const konten = personen.map(mapBankAccount).filter((k) => k !== null);
  const mandate = personen.map(mapMandate).filter((m) => m !== null);
  const mitgliedschaftenGemappt = mitgliedschaften.map(mapMembership);

  const mailKonflikte = findeMailKonflikte(mitglieder);
  const referenzKonflikte = findeReferenzKonflikte(mandate);

  const ohneMail = mitglieder.filter((m) => !m.email);
  const ohneGeburtstag = mitglieder.filter((m) => !m.birthday);
  const ohneKonto = mitglieder.filter(
    (m) => !konten.some((k) => k.ebusy_person_id === m.ebusy_person_id),
  );
  const minderjaehrig = mitglieder.filter((m) => istMinderjaehrig(m.birthday));

  const betroffeneVonMailKonflikt = [...mailKonflikte.values()].flat();
  const volljaehrigeInKonflikt = betroffeneVonMailKonflikt.filter(
    (m) => !istMinderjaehrig(m.birthday),
  );

  const mehrfachBeitrag = mitgliedschaftenGemappt.filter(
    (m) => m.fee_type_names.length > 1,
  );

  console.warn("Gefunden");
  console.warn(`  Personen                 ${mitglieder.length}`);
  console.warn(`  Mitgliedschaften         ${mitgliedschaftenGemappt.length}`);
  console.warn(`  Bankverbindungen         ${konten.length}`);
  console.warn(`  SEPA-Mandate             ${mandate.length}`);
  console.warn(`  davon nie benutzt        ${mandate.filter((m) => !m.last_used_on).length}`);
  console.warn(`  mit zwei Beitragsarten   ${mehrfachBeitrag.length}`);
  console.warn(`  minderjaehrig            ${minderjaehrig.length}`);

  console.warn("\nVor dem Cutover zu bereinigen");
  console.warn(`  Mehrfach genutzte E-Mail-Adressen  ${mailKonflikte.size}`);
  console.warn(`    betroffene Personen              ${betroffeneVonMailKonflikt.length}`);
  console.warn(`    davon volljaehrig                ${volljaehrigeInKonflikt.length}  <- brauchen eine eigene Adresse`);
  console.warn(`  Personen ohne E-Mail               ${ohneMail.length}  (Kinder brauchen keine)`);
  console.warn(`  Personen ohne Geburtsdatum         ${ohneGeburtstag.length}`);
  console.warn(`  Personen ohne Bankverbindung       ${ohneKonto.length}  (zahlen per Ueberweisung)`);
  console.warn(`  Doppelte Mandatsreferenzen         ${referenzKonflikte.size}`);
  console.warn(
    `    betroffene Mandate               ${
      mandate.filter((m) => referenzKonflikte.has(m.reference.toUpperCase())).length
    }`,
  );

  if (mailKonflikte.size > 0) {
    console.warn("\nMehrfach genutzte Adressen im Einzelnen");
    for (const [mail, liste] of mailKonflikte) {
      const namen = liste
        .map((m) => `${m.first_name} ${m.last_name}${istMinderjaehrig(m.birthday) ? " (minderj.)" : ""}`)
        .join(", ");
      console.warn(`  ${mail}: ${namen}`);
    }
  }

  console.warn(
    "\nHinweis: Der Import wird ueber ebusy_id abgeglichen und ist damit " +
      "wiederholbar. Ein zweiter Lauf darf keine neuen Zeilen erzeugen.",
  );
}

main().catch((fehler: unknown) => {
  console.error("\nAbbruch:", fehler instanceof Error ? fehler.message : fehler);
  process.exit(1);
});
