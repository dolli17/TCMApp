/**
 * Push-Benachrichtigungen auf Geraeteseite
 *
 * Die App holt die Erlaubnis, laesst sich von Expo eine Marke geben und meldet
 * diese in der Datenbank an. Der Versand laeuft von dort - siehe die Edge
 * Function notification-pushes.
 *
 * Was hier NICHT stattfindet, ist eine eigene Einwilligung in der Datenbank.
 * Die Zustimmung ist der Systemdialog plus die angemeldete Marke; der Widerruf
 * ist das Abmelden im Konto oder das Abschalten in den Geraeteeinstellungen.
 *
 * In Expo Go kommt kein Remote-Push an, und der Simulator liefert ueberhaupt
 * keine Marke - dafuer braucht es einen Development Build auf einem echten
 * Geraet. Deshalb geben die Funktionen hier einen sprechenden Grund zurueck,
 * statt zu werfen: ein Fehler beim Anmelden darf die Anmeldung an der App
 * nicht aufhalten.
 */

import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { translateDbError } from "@tcm/core";
import { supabase } from "./supabase";
import type { Ergebnis } from "./daten";

/** Was die App tun soll, wenn eine Nachricht ankommt, waehrend sie offen ist. */
export function setzeAnzeigeverhalten(): void {
  Notifications.setNotificationHandler({
    // shouldShowAlert und nicht die neueren shouldShowBanner/-List: die
    // wurden erst nach SDK 52 eingefuehrt.
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

/**
 * Ohne Kanal zeigt Android ab Version 8 gar nichts an - ohne Fehlermeldung.
 */
async function stelleKanalSicher(): Promise<void> {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync("standard", {
    name: "Buchungen",
    importance: Notifications.AndroidImportance.MAX,
    lightColor: "#1A82C6",
  });
}

/** Die zuletzt angemeldete Marke - zum Abmelden beim Verlassen. */
let letzteMarke: string | null = null;

export function angemeldeteMarke(): string | null {
  return letzteMarke;
}

/**
 * Erlaubnis holen, Marke besorgen, in der Datenbank anmelden.
 *
 * Aufzurufen nach der Anmeldung, nicht beim ersten Start: ein Erlaubnisdialog
 * vor dem Login erklaert sich nicht, und ohne Sitzung weist die RPC ohnehin ab.
 */
export async function registriereGeraet(): Promise<Ergebnis> {
  if (!Device.isDevice) {
    return { ok: false, meldung: "Der Simulator kann keine Benachrichtigungen empfangen." };
  }

  await stelleKanalSicher();

  const vorhanden = await Notifications.getPermissionsAsync();
  let status = vorhanden.status;

  if (status !== "granted") {
    const gefragt = await Notifications.requestPermissionsAsync();
    status = gefragt.status;
  }

  if (status !== "granted") {
    return { ok: false, meldung: "Ohne Erlaubnis des Geräts geht es nicht." };
  }

  // Ohne projectId scheitert das erst zur Laufzeit, nicht beim Bauen - der
  // Eintrag steht in app.json unter extra.eas.projectId.
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

  if (!projectId) {
    return { ok: false, meldung: "Die App ist noch keinem Expo-Projekt zugeordnet." };
  }

  let marke: string;
  try {
    const antwort = await Notifications.getExpoPushTokenAsync({ projectId });
    marke = antwort.data;
  } catch {
    return { ok: false, meldung: "Das Gerät hat keine Kennung geliefert." };
  }

  const { error } = await supabase.rpc("register_push_token", {
    p_token: marke,
    p_platform: Platform.OS === "android" ? "android" : "ios",
    p_device_name: Device.deviceName ?? undefined,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  letzteMarke = marke;
  return { ok: true, meldung: "Benachrichtigungen sind eingeschaltet." };
}

/**
 * Vor dem Abmelden aufzurufen.
 *
 * Bleibt die Marke stehen, bekommt das Geraet weiter die Nachrichten des
 * Vorbesitzers - auf einem Familientelefon faellt das sofort auf.
 */
export async function meldeGeraetAb(): Promise<Ergebnis> {
  const marke = letzteMarke ?? (await markeHolen());
  if (!marke) return { ok: true, meldung: "" };

  const { error } = await supabase.rpc("remove_push_token", { p_token: marke });
  letzteMarke = null;

  if (error) return { ok: false, meldung: translateDbError(error) };
  return { ok: true, meldung: "Benachrichtigungen sind ausgeschaltet." };
}

/** Holt die Marke erneut, falls die App seit dem Anmelden neu gestartet wurde. */
async function markeHolen(): Promise<string | null> {
  if (!Device.isDevice) return null;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return null;

  try {
    const antwort = await Notifications.getExpoPushTokenAsync({ projectId });
    return antwort.data;
  } catch {
    return null;
  }
}

/** Ist auf diesem Geraet gerade ein Empfang angemeldet? */
export async function istAngemeldet(): Promise<boolean> {
  const marke = letzteMarke ?? (await markeHolen());
  if (!marke) return false;

  const { data } = await supabase
    .from("push_tokens")
    .select("id")
    .eq("token", marke)
    .is("disabled_at", null)
    .maybeSingle();

  return Boolean(data);
}
