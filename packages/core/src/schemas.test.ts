import { describe, expect, it } from "vitest";
import {
  amountSchema,
  emailSchema,
  ibanSchema,
  memberProfileSchema,
  uuidSchema,
} from "./schemas";

/**
 * Diese Schemas waren lange geschrieben, aber nirgends benutzt - und deshalb
 * auch nie geprueft. Mit der Selbstpflege im Konto landen ihre Meldungen zum
 * ersten Mal wirklich im Formular; die Tests halten fest, was dort steht.
 */

describe("memberProfileSchema", () => {
  const gueltig = {
    firstName: "Anna",
    lastName: "Meier",
    title: "",
    phone: "",
    mobile: "0170 1234567",
    street: "Bahnhofstr. 20",
    postcode: "70376",
    city: "Stuttgart",
  };

  it("nimmt einen vollstaendigen Datensatz an", () => {
    expect(memberProfileSchema.safeParse(gueltig).success).toBe(true);
  });

  it("erlaubt leere Zeichenketten fuer die optionalen Felder", () => {
    const nurPflicht = { ...gueltig, mobile: "", street: "", postcode: "", city: "" };
    expect(memberProfileSchema.safeParse(nurPflicht).success).toBe(true);
  });

  it("besteht auf einem Vornamen", () => {
    const e = memberProfileSchema.safeParse({ ...gueltig, firstName: "   " });
    expect(e.success).toBe(false);
    expect(e.error?.issues[0]?.message).toBe("Vorname fehlt.");
  });

  it("besteht auf einem Nachnamen", () => {
    const e = memberProfileSchema.safeParse({ ...gueltig, lastName: "" });
    expect(e.success).toBe(false);
    expect(e.error?.issues[0]?.message).toBe("Nachname fehlt.");
  });

  it("weist eine vierstellige Postleitzahl ab", () => {
    const e = memberProfileSchema.safeParse({ ...gueltig, postcode: "7037" });
    expect(e.success).toBe(false);
    expect(e.error?.issues[0]?.message).toBe("Postleitzahl muss fünfstellig sein.");
  });

  it("weist eine Postleitzahl mit Buchstaben ab", () => {
    expect(memberProfileSchema.safeParse({ ...gueltig, postcode: "7037A" }).success).toBe(false);
  });

  it("schneidet umgebende Leerzeichen ab", () => {
    const e = memberProfileSchema.safeParse({ ...gueltig, firstName: "  Anna  " });
    expect(e.success).toBe(true);
    expect(e.data?.firstName).toBe("Anna");
  });
});

describe("emailSchema", () => {
  it("nimmt eine gewoehnliche Adresse an", () => {
    expect(emailSchema.safeParse("anna.meier@example.org").success).toBe(true);
  });

  it("weist eine Adresse ohne At-Zeichen ab", () => {
    const e = emailSchema.safeParse("anna.meier.example.org");
    expect(e.success).toBe(false);
    expect(e.error?.issues[0]?.message).toBe("Das ist keine gültige E-Mail-Adresse.");
  });

  it("weist eine leere Eingabe ab", () => {
    expect(emailSchema.safeParse("   ").success).toBe(false);
  });
});

describe("ibanSchema", () => {
  it("nimmt eine gueltige IBAN an, auch mit Leerzeichen", () => {
    expect(ibanSchema.safeParse("DE89 3704 0044 0532 0130 00").success).toBe(true);
  });

  it("weist eine IBAN mit vertauschten Ziffern ab", () => {
    const e = ibanSchema.safeParse("DE89370400440532013001");
    expect(e.success).toBe(false);
    expect(e.error?.issues[0]?.message).toContain("nicht gültig");
  });
});

describe("uuidSchema", () => {
  it("nimmt eine Kennung an", () => {
    expect(uuidSchema.safeParse("bab70f7a-d0b8-49dd-9613-46ab5f66e4ab").success).toBe(true);
  });

  it("weist alles andere ab", () => {
    expect(uuidSchema.safeParse("kein-uuid").success).toBe(false);
  });
});

describe("amountSchema", () => {
  it.each(["19", "19,00", "19.50", "0,99"])("nimmt %s an", (wert) => {
    expect(amountSchema.safeParse(wert).success).toBe(true);
  });

  it.each(["19,000", "19€", "abc", "-5"])("weist %s ab", (wert) => {
    expect(amountSchema.safeParse(wert).success).toBe(false);
  });
});
