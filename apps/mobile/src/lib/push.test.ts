/**
 * Push auf Geraeteseite gegen nachgebildete Expo-Module.
 *
 * Geprueft wird, dass jede Huerde einen sprechenden Grund liefert statt zu
 * werfen, dass die Marke angemeldet und beim Abmelden wieder entfernt wird,
 * und dass ein Tippen auf die Nachricht nur Pfade der App oeffnet.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const push = vi.fn();
let pushTokenZeile: unknown = null;

const geraet = { isDevice: true, deviceName: "Kiras iPhone" as string | null };
const plattform = { OS: "ios" };
const konstanten: { expoConfig: unknown; easConfig: unknown } = {
  expoConfig: { extra: { eas: { projectId: "projekt-1" } } },
  easConfig: null,
};
const benachrichtigungen = {
  setNotificationHandler: vi.fn(),
  setNotificationChannelAsync: vi.fn(),
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  getExpoPushTokenAsync: vi.fn(),
  useLastNotificationResponse: vi.fn(),
  AndroidImportance: { MAX: 5 },
};

vi.mock("react-native", () => ({ Platform: plattform }));
vi.mock("expo-router", () => ({ router: { push: (...a: unknown[]) => push(...a) } }));
vi.mock("expo-constants", () => ({ default: konstanten }));
vi.mock("expo-device", () => geraet);
vi.mock("expo-notifications", () => benachrichtigungen);
vi.mock("./supabase", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    from: () => {
      const k = {
        select: () => k,
        eq: () => k,
        is: () => k,
        maybeSingle: () => Promise.resolve({ data: pushTokenZeile, error: null }),
      };
      return k;
    },
  },
}));

// usePushZiel ist ein Hook; ohne Renderer laufen useRef und useEffect hier
// sofort und mit einer Referenz, die ueber die Aufrufe bestehen bleibt.
const referenz = { current: null as unknown };
vi.mock("react", () => ({
  useRef: () => referenz,
  useEffect: (f: () => void) => f(),
}));

const push_ = await import("./push");

beforeEach(() => {
  vi.clearAllMocks();
  geraet.isDevice = true;
  geraet.deviceName = "Kiras iPhone";
  plattform.OS = "ios";
  konstanten.expoConfig = { extra: { eas: { projectId: "projekt-1" } } };
  konstanten.easConfig = null;
  benachrichtigungen.getPermissionsAsync.mockResolvedValue({ status: "granted" });
  benachrichtigungen.requestPermissionsAsync.mockResolvedValue({ status: "granted" });
  benachrichtigungen.getExpoPushTokenAsync.mockResolvedValue({ data: "ExponentPushToken[abc]" });
  rpc.mockResolvedValue({ data: null, error: null });
  pushTokenZeile = null;
  referenz.current = null;
});

describe("registriereGeraet", () => {
  it("meldet die Marke an", async () => {
    expect(await push_.registriereGeraet()).toEqual({
      ok: true,
      meldung: "Benachrichtigungen sind eingeschaltet.",
    });
    expect(rpc).toHaveBeenCalledWith("register_push_token", {
      p_token: "ExponentPushToken[abc]",
      p_platform: "ios",
      p_device_name: "Kiras iPhone",
    });
    expect(push_.angemeldeteMarke()).toBe("ExponentPushToken[abc]");
    expect(benachrichtigungen.setNotificationChannelAsync).not.toHaveBeenCalled();
  });

  it("legt unter Android zuerst den Kanal an", async () => {
    plattform.OS = "android";
    geraet.deviceName = null;
    await push_.registriereGeraet();
    expect(benachrichtigungen.setNotificationChannelAsync).toHaveBeenCalledWith(
      "standard",
      expect.objectContaining({ name: "Buchungen" }),
    );
    expect(rpc).toHaveBeenCalledWith("register_push_token", {
      p_token: "ExponentPushToken[abc]",
      p_platform: "android",
      p_device_name: undefined,
    });
  });

  it("fragt nach, wenn die Erlaubnis noch fehlt", async () => {
    benachrichtigungen.getPermissionsAsync.mockResolvedValue({ status: "undetermined" });
    expect((await push_.registriereGeraet()).ok).toBe(true);
    expect(benachrichtigungen.requestPermissionsAsync).toHaveBeenCalled();
  });

  it("gibt Gruende statt zu werfen", async () => {
    geraet.isDevice = false;
    expect(await push_.registriereGeraet()).toEqual({
      ok: false,
      meldung: "Der Simulator kann keine Benachrichtigungen empfangen.",
    });

    geraet.isDevice = true;
    benachrichtigungen.getPermissionsAsync.mockResolvedValue({ status: "denied" });
    benachrichtigungen.requestPermissionsAsync.mockResolvedValue({ status: "denied" });
    expect((await push_.registriereGeraet()).meldung).toBe("Ohne Erlaubnis des Geräts geht es nicht.");

    benachrichtigungen.getPermissionsAsync.mockResolvedValue({ status: "granted" });
    konstanten.expoConfig = {};
    expect((await push_.registriereGeraet()).meldung).toBe(
      "Die App ist noch keinem Expo-Projekt zugeordnet.",
    );

    konstanten.easConfig = { projectId: "aus-eas" };
    benachrichtigungen.getExpoPushTokenAsync.mockRejectedValue(new Error("kein APNs"));
    expect((await push_.registriereGeraet()).meldung).toBe("Das Gerät hat keine Kennung geliefert.");
    expect(benachrichtigungen.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: "aus-eas" });

    expect(rpc).not.toHaveBeenCalled();
  });

  it("uebersetzt Fehler der Datenbank", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "permission denied", code: "42501" } });
    expect(await push_.registriereGeraet()).toEqual({
      ok: false,
      meldung: "Dafür fehlt dir die Berechtigung.",
    });
  });
});

describe("meldeGeraetAb", () => {
  it("entfernt die zuletzt angemeldete Marke", async () => {
    await push_.registriereGeraet();
    rpc.mockClear();
    benachrichtigungen.getExpoPushTokenAsync.mockClear();

    expect(await push_.meldeGeraetAb()).toEqual({
      ok: true,
      meldung: "Benachrichtigungen sind ausgeschaltet.",
    });
    expect(rpc).toHaveBeenCalledWith("remove_push_token", { p_token: "ExponentPushToken[abc]" });
    expect(benachrichtigungen.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(push_.angemeldeteMarke()).toBeNull();
  });

  it("holt die Marke nach einem Neustart erneut", async () => {
    expect((await push_.meldeGeraetAb()).ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("remove_push_token", { p_token: "ExponentPushToken[abc]" });
  });

  it("tut ohne Marke nichts", async () => {
    geraet.isDevice = false;
    expect(await push_.meldeGeraetAb()).toEqual({ ok: true, meldung: "" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("vergisst die Marke auch, wenn die Datenbank ablehnt", async () => {
    await push_.registriereGeraet();
    rpc.mockResolvedValue({ data: null, error: { message: "permission denied", code: "42501" } });
    expect((await push_.meldeGeraetAb()).ok).toBe(false);
    expect(push_.angemeldeteMarke()).toBeNull();
  });
});

describe("istAngemeldet", () => {
  it("fragt die Datenbank nach der Marke", async () => {
    expect(await push_.istAngemeldet()).toBe(false);
    pushTokenZeile = { id: "t1" };
    expect(await push_.istAngemeldet()).toBe(true);
  });

  it("ist ohne Marke aus", async () => {
    konstanten.expoConfig = null;
    pushTokenZeile = { id: "t1" };
    expect(await push_.istAngemeldet()).toBe(false);
  });
});

describe("usePushZiel", () => {
  function antwort(id: string, ziel: unknown) {
    benachrichtigungen.useLastNotificationResponse.mockReturnValue({
      notification: { request: { identifier: id, content: { data: { ziel } } } },
    });
  }

  it("oeffnet das Ziel einmal", () => {
    antwort("n1", "/veranstaltungen/abc");
    push_.usePushZiel();
    push_.usePushZiel();
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/veranstaltungen/abc");

    antwort("n2", "/nachrichten");
    push_.usePushZiel();
    expect(push).toHaveBeenLastCalledWith("/nachrichten");
  });

  it.each([
    ["fremde Adresse", "https://boese.example/"],
    ["protokollrelativ", "//boese.example"],
    ["relativ", "nachrichten"],
    ["kein Text", 42],
    ["fehlt", undefined],
  ])("oeffnet nichts bei %s", (_name, ziel) => {
    antwort("n3", ziel);
    push_.usePushZiel();
    expect(push).not.toHaveBeenCalled();
  });

  it("tut ohne Antwort nichts", () => {
    benachrichtigungen.useLastNotificationResponse.mockReturnValue(null);
    push_.usePushZiel();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("setzeAnzeigeverhalten", () => {
  it("zeigt Nachrichten auch bei offener App", async () => {
    push_.setzeAnzeigeverhalten();
    const { handleNotification } = benachrichtigungen.setNotificationHandler.mock.calls[0]![0];
    expect(await handleNotification()).toEqual({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    });
  });
});
