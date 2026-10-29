import { describe, expect, it } from "vitest";
import { androidFingerabdruecke, appleAppSiteAssociation, assetLinks } from "./applinks";

const FP = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, "0").toUpperCase()).join(":");
const FP2 = FP.replace(/^00/, "FF");

describe("appleAppSiteAssociation", () => {
  it("öffnet nur /passwort-setzen in beiden Apps und nennt sie für die Passwörter", () => {
    expect(appleAppSiteAssociation()).toEqual({
      applinks: {
        details: [
          {
            appIDs: ["93Z2KKGMV7.de.tcmuckensturm.app", "93Z2KKGMV7.de.tcmuckensturm.app.dev"],
            components: [{ "/": "/passwort-setzen" }, { "/": "/passwort-setzen/*" }],
          },
        ],
      },
      webcredentials: {
        apps: ["93Z2KKGMV7.de.tcmuckensturm.app", "93Z2KKGMV7.de.tcmuckensturm.app.dev"],
      },
    });
  });

  it("nutzt die neue Syntax ohne paths und ohne appID", () => {
    const [eintrag] = appleAppSiteAssociation().applinks.details;
    expect(eintrag).not.toHaveProperty("paths");
    expect(eintrag).not.toHaveProperty("appID");
  });
});

describe("androidFingerabdruecke", () => {
  it("ohne Wert: keine", () => {
    expect(androidFingerabdruecke(undefined)).toEqual([]);
    expect(androidFingerabdruecke("")).toEqual([]);
    expect(androidFingerabdruecke(" , ")).toEqual([]);
  });

  it("kommagetrennt, mit Leerzeichen und klein geschrieben", () => {
    expect(androidFingerabdruecke(` ${FP.toLowerCase()} ,${FP2}`)).toEqual([FP, FP2]);
  });

  it("verwirft Ungültiges und Doppeltes", () => {
    expect(androidFingerabdruecke(`${FP},abc,${FP.replace(/:/g, "")},${FP}`)).toEqual([FP]);
  });
});

describe("assetLinks", () => {
  it("ohne Fingerabdruck: null", () => {
    expect(assetLinks([])).toBeNull();
  });

  it("beide Pakete, für Links und Passwörter", () => {
    expect(assetLinks([FP])).toEqual(
      ["de.tcmuckensturm.app", "de.tcmuckensturm.app.dev"].map((paket) => ({
        relation: ["delegate_permission/common.handle_all_urls", "delegate_permission/common.get_login_creds"],
        target: { namespace: "android_app", package_name: paket, sha256_cert_fingerprints: [FP] },
      })),
    );
  });
});
