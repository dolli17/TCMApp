/**
 * Eingabepruefung mit Zod
 *
 * Diese Schemas pruefen Formulare, bevor etwas an die Datenbank geht. Sie
 * ersetzen keine der serverseitigen Regeln - sie sorgen nur dafuer, dass
 * offensichtlich Falsches gar nicht erst abgeschickt wird und der Benutzer
 * eine Meldung an der richtigen Stelle im Formular sieht.
 */

import { z } from "zod";
import { isValidIban } from "./iban";

export const uuidSchema = z.string().uuid("Ungueltige Kennung.");

export const emailSchema = z
  .string()
  .trim()
  .min(1, "E-Mail-Adresse fehlt.")
  .email("Das ist keine gueltige E-Mail-Adresse.");

export const ibanSchema = z
  .string()
  .trim()
  .refine(isValidIban, "Diese IBAN ist nicht gueltig - bitte Ziffern pruefen.");

/** Betrag als Text, wie er aus einem Eingabefeld kommt. */
export const amountSchema = z
  .string()
  .trim()
  .regex(/^\d+([.,]\d{1,2})?$/, "Betrag im Format 19,00 angeben.");

export const memberProfileSchema = z.object({
  firstName: z.string().trim().min(1, "Vorname fehlt.").max(100),
  lastName: z.string().trim().min(1, "Nachname fehlt.").max(100),
  title: z.string().trim().max(50).optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional().or(z.literal("")),
  mobile: z.string().trim().max(50).optional().or(z.literal("")),
  street: z.string().trim().max(200).optional().or(z.literal("")),
  postcode: z
    .string()
    .trim()
    .regex(/^\d{5}$/, "Postleitzahl muss fuenfstellig sein.")
    .optional()
    .or(z.literal("")),
  city: z.string().trim().max(100).optional().or(z.literal("")),
});

export const createBookingSchema = z
  .object({
    courtId: uuidSchema,
    startsAt: z.date(),
    bookingTypeCode: z.string().min(1, "Buchungsart waehlen."),
    playerMemberIds: z.array(uuidSchema).default([]),
    guestNames: z.array(z.string().trim().min(1, "Gastname fehlt.")).default([]),
  })
  .refine(
    (v) => new Set(v.playerMemberIds).size === v.playerMemberIds.length,
    { message: "Ein Mitspieler wurde doppelt eingetragen.", path: ["playerMemberIds"] },
  );

export const drinkPurchaseSchema = z.object({
  drinkItemId: uuidSchema,
  quantity: z
    .number()
    .int("Nur ganze Stueck.")
    .min(1, "Mindestens ein Stueck.")
    .max(50, "Mehr als 50 auf einmal ist vermutlich ein Vertipper."),
});

export const seriesSchema = z
  .object({
    courtId: uuidSchema,
    bookingTypeCode: z.string().min(1),
    weekday: z.number().int().min(0).max(6),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, "Uhrzeit als HH:MM angeben."),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, "Uhrzeit als HH:MM angeben."),
    validFrom: z.date(),
    validTo: z.date(),
    title: z.string().trim().min(1, "Titel fehlt.").max(200),
  })
  .refine((v) => v.endTime > v.startTime, {
    message: "Die Endzeit muss nach der Startzeit liegen.",
    path: ["endTime"],
  })
  .refine((v) => v.validTo >= v.validFrom, {
    message: "Das Enddatum darf nicht vor dem Startdatum liegen.",
    path: ["validTo"],
  });

export const workDutyEntrySchema = z.object({
  memberId: uuidSchema,
  year: z.number().int().min(1970).max(2200),
  hours: z
    .number()
    .positive("Stunden muessen groesser als null sein.")
    .max(200, "So viele Stunden auf einmal sind unplausibel."),
  workedOn: z.date(),
  description: z.string().trim().max(500).optional().or(z.literal("")),
});

export type MemberProfileInput = z.infer<typeof memberProfileSchema>;
export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type DrinkPurchaseInput = z.infer<typeof drinkPurchaseSchema>;
export type SeriesInput = z.infer<typeof seriesSchema>;
export type WorkDutyEntryInput = z.infer<typeof workDutyEntrySchema>;
