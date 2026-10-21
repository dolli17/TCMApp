/**
 * Wo die App ihre Sitzung ablegt: auf dem Telefon im Schluesselbund, im
 * Browser in AsyncStorage. Der Client selbst ist nachgebildet.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn((..._a: unknown[]) => ({}));
const plattform = { OS: "ios" };
const asyncStorage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() };
const secureStore = {
  AFTER_FIRST_UNLOCK: "nach-dem-ersten-entsperren",
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
};

vi.mock("react-native-url-polyfill/auto", () => ({}));
vi.mock("react-native", () => ({ Platform: plattform }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: asyncStorage }));
vi.mock("expo-secure-store", () => secureStore);
vi.mock("@supabase/supabase-js", () => ({ createClient: (...a: unknown[]) => createClient(...a) }));

async function laden(env: { url?: string; key?: string; os: string }) {
  vi.resetModules();
  createClient.mockClear();
  plattform.OS = env.os;
  vi.stubEnv("EXPO_PUBLIC_SUPABASE_URL", env.url ?? "");
  vi.stubEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY", env.key ?? "");
  const modul = await import("./supabase");
  const [url, key, optionen] = createClient.mock.calls[0] as [string, string, { auth: Record<string, unknown> }];
  return { modul, url, key, auth: optionen.auth };
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("supabase", () => {
  it("haelt die Sitzung auf dem Telefon im Schluesselbund", async () => {
    const { modul, url, key, auth } = await laden({ url: "http://api", key: "anon", os: "ios" });
    expect(modul.istKonfiguriert()).toBe(true);
    expect([url, key]).toEqual(["http://api", "anon"]);
    expect(auth).toMatchObject({ persistSession: true, autoRefreshToken: true, detectSessionInUrl: false });
    expect(auth.storage).not.toBe(asyncStorage);

    const speicher = auth.storage as { setItem: (k: string, v: string) => Promise<void> };
    await speicher.setItem("sb-x-auth-token", "{}");
    expect(secureStore.setItemAsync).toHaveBeenCalled();
    for (const aufruf of secureStore.setItemAsync.mock.calls) {
      expect(aufruf[2]).toEqual({ keychainAccessible: "nach-dem-ersten-entsperren" });
    }
  });

  it("nimmt im Browser AsyncStorage", async () => {
    const { auth } = await laden({ url: "http://api", key: "anon", os: "web" });
    expect(auth.storage).toBe(asyncStorage);
  });

  it("stuerzt ohne Konfiguration nicht ab, sondern warnt", async () => {
    const warnung = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { modul } = await laden({ os: "ios" });
    expect(modul.istKonfiguriert()).toBe(false);
    expect(warnung).toHaveBeenCalledWith(expect.stringContaining("EXPO_PUBLIC_SUPABASE_URL"));
  });
});
