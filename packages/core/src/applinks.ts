/**
 * Universal Links (iOS) und App Links (Android)
 *
 * Das Web beweist mit zwei Dateien unter /.well-known, dass die nativen Apps
 * Links auf diese Domain öffnen und gespeicherte Passwörter vorschlagen
 * dürfen. Die Inhalte stehen hier, die Routen in apps/web liefern sie nur aus.
 *
 * Beide Apps (Prod und Dev) stehen in beiden Umgebungen: Das Web kennt seine
 * Umgebung zur Laufzeit nicht (es gibt keine Variable dafür, nur die
 * eingebackene Supabase-URL). Schaden tut es nicht - jede App prüft nur die
 * Domains, die sie selbst in ihren Entitlements bzw. im Manifest nennt.
 */

/** Team-ID und Bundle-IDs aus dem Apple-Developer-Konto des Vereins. */
export const APPLE_APP_IDS = ["93Z2KKGMV7.de.tcmuckensturm.app", "93Z2KKGMV7.de.tcmuckensturm.app.dev"] as const;

export const ANDROID_PAKETE = ["de.tcmuckensturm.app", "de.tcmuckensturm.app.dev"] as const;

/**
 * Pfade, die die App statt des Browsers öffnet. Vorerst nur der Link aus der
 * Einladungs- und Passwortmail; alles andere bleibt im Browser.
 */
export const APP_LINK_PFADE = ["/passwort-setzen", "/passwort-setzen/*"] as const;

/** apple-app-site-association in der neuen Syntax (components, ab iOS 13). */
export function appleAppSiteAssociation() {
  return {
    applinks: {
      details: [
        {
          appIDs: [...APPLE_APP_IDS],
          components: APP_LINK_PFADE.map((pfad) => ({ "/": pfad })),
        },
      ],
    },
    webcredentials: { apps: [...APPLE_APP_IDS] },
  };
}

/** SHA-256 eines Signierzertifikats, wie Android es erwartet: 32 Byte hex mit Doppelpunkten. */
const FINGERABDRUCK = /^[0-9A-F]{2}(?::[0-9A-F]{2}){31}$/;

/**
 * Liest die Fingerabdrücke aus ANDROID_APP_FINGERPRINTS (kommagetrennt).
 * Kleinschreibung wird angeglichen, Ungültiges fällt weg, damit ein Tippfehler
 * nicht eine kaputte Datei ausliefert.
 */
export function androidFingerabdruecke(wert: string | undefined): string[] {
  return [
    ...new Set(
      (wert ?? "")
        .split(",")
        .map((f) => f.trim().toUpperCase())
        .filter((f) => FINGERABDRUCK.test(f)),
    ),
  ];
}

/**
 * assetlinks.json für beide Pakete, oder null ohne einen gültigen
 * Fingerabdruck. Eine Liste ohne Fingerabdruck wäre wertlos: Android würde die
 * Domain dann für keine App bestätigen.
 *
 * Alle Fingerabdrücke gelten für beide Pakete. Signieren Prod und Dev mit
 * verschiedenen Schlüsseln, stehen eben beide in der Variable.
 */
export function assetLinks(fingerabdruecke: string[]) {
  if (fingerabdruecke.length === 0) return null;
  return ANDROID_PAKETE.map((paket) => ({
    relation: ["delegate_permission/common.handle_all_urls", "delegate_permission/common.get_login_creds"],
    target: {
      namespace: "android_app",
      package_name: paket,
      sha256_cert_fingerprints: fingerabdruecke,
    },
  }));
}
