/**
 * Golden Files: wie jede Funktion aus den JSON-Eingaben aufgerufen wird
 *
 * Die Dateien unter packages/core/golden/ halten Eingabe und Ausgabe der
 * Rechenlogik fest, die die App nutzt. Swift und Kotlin pruefen ihre
 * Portierung gegen dieselben Dateien (golden/README.md). Damit die Dateien
 * wahr bleiben, rechnet golden.test.ts jeden Fall mit der
 * TypeScript-Implementierung nach - ueber die Adapter hier.
 *
 * Konventionen fuer die Eingabe: Parameter heissen wie in der Signatur,
 * Zeitpunkte (now, Date-Parameter) stehen als ISO-Zeitstempel in UTC. Ein
 * Feld, das fehlt, ist undefined. Die Ausgabe ist das Ergebnis nach
 * JSON.stringify - ein Date also ebenfalls als ISO-Zeitstempel, undefined
 * faellt weg.
 */

import {
  berlinTime, bookingActions, canStartAt, checkPlayers, freeCourtsNow, minutesOf, minutesToTime, missingPlayers,
  otherPlayersLabel, timeToMinutes, umsetzZiele, type BookingTypeInfo,
} from "../booking";
import { courtStatusAt, type CourtSlot } from "../courtStatus";
import {
  basketAfterBatch, basketReminder, basketSummary, canVoidSelf, changeBasket, drinkBatchReport, type DrinkBasket,
  type DrinkBatchResult, type DrinkPurchase,
} from "../drinks";
import { translateDbError, type PostgresLikeError } from "../errors";
import { CHARGE_KIND_LABEL } from "../forderungen";
import { freeGaps, freeSlotsOfDay, occupancyLabel, startInGap, type FreeGap } from "../freeSlots";
import {
  blockingLabel, dayLabel, dayTag, occupancyKind, sumOpenDrinks, upcomingBookings, type OccupancyFlags,
} from "../home";
import { merkmalBeschreibung, type MerkmalSicht } from "../merkmaltexte";
import { formatCents } from "../money";
import { offenesSpielText } from "../offeneSpiele";
import type { ChargeKind } from "../sepa/types";
import { eventStatusMarke, eventZeitText } from "../veranstaltungen";
import {
  eventAbmeldbar, eventAbmeldenKnopf, eventAenderbar, eventAnmeldenKnopf, eventBelegungText, eventGebuehrHinweis,
  eventLangeZeit, eventMonatsGruppen, eventNurWarteliste, eventPersonenText, eventWartelisteText, type MitgliedEvent,
} from "../veranstaltungen-mitglieder";
import { sichererWeiterPfad } from "../weiterleitung";
import { zugangsGrund } from "../zugang";

/** Ein Fall, wie er in der JSON-Datei steht. */
export interface GoldenFall {
  name: string;
  input: Record<string, unknown>;
  output: unknown;
}

// Die Eingaben kommen aus JSON und sind deshalb nicht typisiert. Jeder
// Adapter sagt mit `as`, was er erwartet; stimmt eine Datei nicht, faellt das
// im Test als falsches Ergebnis auf.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Eingabe = any;

/** "now" als Date, sofern angegeben */
function jetzt(input: Eingabe): { now?: Date } {
  return input.now === undefined ? {} : { now: new Date(input.now as string) };
}

export const aufrufe: Record<string, (input: Eingabe) => unknown> = {
  berlinTime: (i) => berlinTime(i.day as string, i.minutes as number),
  minutesOf: (i) => minutesOf(i.iso as string),
  minutesToTime: (i) => minutesToTime(i.minutes as number),
  timeToMinutes: (i) => timeToMinutes(i.value as string),
  dayLabel: (i) => dayLabel(i.startsAt as string, new Date(i.now as string)),
  dayTag: (i) => dayTag(i.startsAt as string, new Date(i.now as string)),
  upcomingBookings: (i) =>
    upcomingBookings(i.termine as { starts_at: string; ends_at: string }[], new Date(i.now as string)),
  canStartAt: (i) => canStartAt({ ...(i as Parameters<typeof canStartAt>[0]), ...jetzt(i) }),
  freeCourtsNow: (i) => freeCourtsNow({ ...(i as Parameters<typeof freeCourtsNow>[0]), ...jetzt(i) }),
  freeSlotsOfDay: (i) =>
    freeSlotsOfDay({ ...(i as Parameters<typeof freeSlotsOfDay<CourtSlot>>[0]), ...jetzt(i) }),
  courtStatusAt: (i) =>
    courtStatusAt({ ...(i as Parameters<typeof courtStatusAt<CourtSlot>>[0]), ...jetzt(i) }),
  occupancyKind: (i) => occupancyKind(i.b as OccupancyFlags),
  bookingActions: (i) => bookingActions({ ...(i as Parameters<typeof bookingActions>[0]), ...jetzt(i) }),
  freeGaps: (i) => freeGaps({ ...(i as Parameters<typeof freeGaps>[0]), ...jetzt(i) }),
  startInGap: (i) =>
    startInGap(i.gap as FreeGap, i.minute as number, i.slotMinutes as number, i.durationMinutes as number),
  occupancyLabel: (i) => occupancyLabel(i.b as Parameters<typeof occupancyLabel>[0]),
  blockingLabel: (i) => blockingLabel(i.b as Parameters<typeof blockingLabel>[0]),
  checkPlayers: (i) =>
    checkPlayers(
      i.type as BookingTypeInfo, i.memberCount as number, i.guestCount as number, i.partnerWanted as boolean | undefined,
    ),
  missingPlayers: (i) => missingPlayers(i.type as BookingTypeInfo, i.memberCount as number, i.guestCount as number),
  otherPlayersLabel: (i) => otherPlayersLabel(i.type as BookingTypeInfo),
  umsetzZiele: (i) => umsetzZiele({ ...(i as Parameters<typeof umsetzZiele>[0]), ...jetzt(i) }),
  changeBasket: (i) => changeBasket(i.basket as DrinkBasket, i.itemId as string, i.delta as number),
  sumOpenDrinks: (i) => sumOpenDrinks(i.kaeufe as Parameters<typeof sumOpenDrinks>[0]),
  formatCents: (i) => formatCents(i.cents as number),
  translateDbError: (i) => translateDbError(i.error as PostgresLikeError | null | undefined),
  eventMonatsGruppen: (i) =>
    eventMonatsGruppen(
      i.liste as Parameters<typeof eventMonatsGruppen>[0],
      new Date(i.now as string),
      i.vergangen as boolean | undefined,
    ),
  zugangsGrund: (i) => zugangsGrund(i.wert as string | null | undefined),
  offenesSpielText: (i) =>
    offenesSpielText(i.spiel as Parameters<typeof offenesSpielText>[0], i.eigenes as boolean | undefined),
  merkmalBeschreibung: (i) =>
    merkmalBeschreibung(i.code as string, i.beschreibung as string, i.sicht as MerkmalSicht),
  sichererWeiterPfad: (i) =>
    i.fallback === undefined ? sichererWeiterPfad(i.wert) : sichererWeiterPfad(i.wert, i.fallback as string),
  CHARGE_KIND_LABEL: (i) => CHARGE_KIND_LABEL[i.kind as ChargeKind],
  eventLangeZeit: (i) => eventLangeZeit(i.startsAt as string, i.endsAt as string | null),
  eventZeitText: (i) => eventZeitText(i.startsAt as string, i.endsAt as string | null),
  eventStatusMarke: (i) => eventStatusMarke(i.e as MitgliedEvent, new Date(i.now as string)),
  eventBelegungText: (i) => eventBelegungText(i.e as MitgliedEvent),
  eventAenderbar: (i) => eventAenderbar(i.e as MitgliedEvent, new Date(i.now as string)),
  eventAbmeldbar: (i) => eventAbmeldbar(i.e as MitgliedEvent, new Date(i.now as string)),
  eventNurWarteliste: (i) => eventNurWarteliste(i.e as MitgliedEvent, i.begleitpersonen as number),
  eventPersonenText: (i) => eventPersonenText(i.begleitpersonen as number),
  eventAnmeldenKnopf: (i) => eventAnmeldenKnopf(i.e as MitgliedEvent, i.begleitpersonen as number),
  eventAbmeldenKnopf: (i) => eventAbmeldenKnopf(i.e as MitgliedEvent, new Date(i.now as string)),
  eventGebuehrHinweis: (i) => eventGebuehrHinweis(i.e as MitgliedEvent),
  eventWartelisteText: (i) => eventWartelisteText(i.platz as number | null, i.laenge as number),
  basketSummary: (i) =>
    basketSummary(i.items as { id: string; price_cents: number | null }[], i.basket as DrinkBasket),
  basketAfterBatch: (i) => basketAfterBatch(i.results as (DrinkBatchResult & { id: string })[]),
  basketReminder: (i) => basketReminder(i.count as number, i.totalCents as number),
  drinkBatchReport: (i) => drinkBatchReport(i.results as DrinkBatchResult[]),
  canVoidSelf: (i) =>
    canVoidSelf(i.purchase as DrinkPurchase, i.windowMinutes as number, new Date(i.now as string)),
};

/** Das Ergebnis so, wie es in der Datei steht: nach JSON-Regeln. */
export function alsJson(wert: unknown): unknown {
  return wert === undefined ? null : JSON.parse(JSON.stringify(wert));
}
