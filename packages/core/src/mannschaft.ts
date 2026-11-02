/**
 * Mannschaft: Einladungen, Kader und die Rechte des Mannschaftsführers
 *
 * Vereinsentscheidung vom 02.11.2026: Ein Mannschaftsführer (MF) lädt
 * Mitglieder in seine Mannschaft ein und trägt Spieler aus. Die Rechte prüft
 * die Datenbank (private.ist_mannschaftsfuehrer); hier stehen nur das Lesen
 * der RPC-Antworten, die Texte und was die Oberfläche daraus ableitet. Web und
 * die nativen Apps zeigen dieselben Sätze.
 */

/** Ein Spieler im Kader, wie meine_mannschaft() ihn liefert. */
export interface KaderSpieler {
  member_id: string;
  first_name: string;
  last_name: string;
  tennis_lk: string | null;
  is_team_captain: boolean;
  /** Mobil, sonst Telefon - nur für MF/Admin und nur mit Zustimmung des Spielers. */
  telefon: string | null;
}

/** Eine offene Einladung aus Sicht des MF. */
export interface OffeneMannschaftsEinladung {
  id: string;
  member_id: string;
  first_name: string;
  last_name: string;
  created_at: string;
  expires_at: string;
}

/** Antwort von meine_mannschaft(); null ohne Mannschaft. */
export interface MeineMannschaft {
  team_id: string;
  name: string;
  ich_bin_mf: boolean;
  telefon_sichtbar: boolean;
  kader: KaderSpieler[];
  /** Nur für den MF gefüllt. */
  offene_einladungen: OffeneMannschaftsEinladung[];
}

/** Eine Zeile aus meine_mannschaft_einladungen(): eine Einladung an mich. */
export interface MeineMannschaftsEinladung {
  id: string;
  team_id: string;
  team_name: string;
  eingeladen_von: string | null;
  created_at: string;
  expires_at: string;
  wechsel_von: string | null;
  annehmen_moeglich: boolean;
  hinweis: string | null;
}

/** Eine Zeile aus mannschaft_kandidaten(). */
export interface MannschaftsKandidat {
  member_id: string;
  first_name: string;
  last_name: string;
  tennis_lk: string | null;
  mannschaft_interesse: boolean;
  aktuelle_mannschaft: string | null;
  eingeladen: boolean;
}

/** Die Arten in notifications.kind, die zur Mannschaft gehören. */
export const MANNSCHAFT_NOTIFICATION_KINDS = [
  "team_invited",
  "team_invitation_answered",
  "team_removed",
  "team_left",
] as const;

export function istMannschaftsNachricht(kind: string | null | undefined): boolean {
  return (MANNSCHAFT_NOTIFICATION_KINDS as readonly string[]).includes(kind ?? "");
}

export const MANNSCHAFT_TEXT = {
  titel: "Mannschaft",
  einladungenTitel: "Einladungen",
  kaderTitel: "Kader",
  telefonZustimmung: "Mannschaftsführer darf meine Telefonnummer sehen",
  telefonZustimmungHinweis: "Im Kader steht dann deine Mobilnummer, sonst deine Telefonnummer. Ändern kannst du das jederzeit unter Konto › Tennis.",
  austretenKnopf: "Aus Mannschaft austreten",
  austretenFrage: (mannschaft: string) => `Wirklich aus ${mannschaft} austreten? Wieder hinein kommst du nur mit einer neuen Einladung.`,
  austragenFrage: (name: string, mannschaft: string) => `${name} aus ${mannschaft} austragen?`,
  hinzufuegenTitel: "Spieler hinzufügen",
  sucheLabel: "Mitglied suchen",
  sucheLeer: "Niemand gefunden.",
  offeneTitel: "Offene Einladungen",
  keineOffenen: "Keine offenen Einladungen.",
  interesse: "Interesse",
  mfMarke: "Mannschaftsführer",
  mfGesperrt: "Als Mannschaftsführer kannst du nicht selbst austreten. Das kann nur der Vorstand ändern.",
} as const;

/** "Vorname Nachname" */
export function spielerName(p: { first_name: string; last_name: string }): string {
  return `${p.first_name} ${p.last_name}`.trim();
}

/**
 * Der Satz unter einer Einladung, bevor man annimmt: Sperre (MF) vor Wechsel.
 * Die Datenbank liefert den Sperrtext mit (hinweis); fehlt er, steht derselbe
 * Satz aus dem Vertrag da.
 */
export function einladungHinweis(e: MeineMannschaftsEinladung): { text: string; sperrt: boolean } | null {
  if (!e.annehmen_moeglich) {
    const text =
      e.hinweis ??
      (e.wechsel_von
        ? `Du bist Mannschaftsführer von ${e.wechsel_von}. Das kann nur der Vorstand ändern.`
        : "Diese Einladung kannst du nicht annehmen.");
    return { text, sperrt: true };
  }
  if (e.wechsel_von) {
    return { text: `Du wechselst damit aus ${e.wechsel_von} in ${e.team_name}.`, sperrt: false };
  }
  return null;
}

/** "Lukas Meier lädt dich in die Mannschaft Herren 40 ein." */
export function einladungTitel(e: Pick<MeineMannschaftsEinladung, "team_name" | "eingeladen_von">): string {
  return e.eingeladen_von
    ? `${e.eingeladen_von} lädt dich in die Mannschaft ${e.team_name} ein.`
    : `Einladung in die Mannschaft ${e.team_name}.`;
}

const TAG_MS = 24 * 60 * 60 * 1000;

/** "verfällt heute", "verfällt morgen", "verfällt in 12 Tagen", "verfallen" */
export function verfallText(expiresAt: string, now: Date = new Date()): string {
  const rest = new Date(expiresAt).getTime() - now.getTime();
  if (Number.isNaN(rest)) return "";
  if (rest <= 0) return "verfallen";
  const tage = Math.floor(rest / TAG_MS);
  if (tage === 0) return "verfällt heute";
  if (tage === 1) return "verfällt morgen";
  return `verfällt in ${tage} Tagen`;
}

/** Die Marken einer Kandidatenzeile: Interesse, "spielt in X", "eingeladen". */
export function kandidatMarken(k: MannschaftsKandidat): { text: string; ton: "gold" | "grau" | "blau" }[] {
  const marken: { text: string; ton: "gold" | "grau" | "blau" }[] = [];
  if (k.eingeladen) marken.push({ text: "eingeladen", ton: "grau" });
  if (k.mannschaft_interesse) marken.push({ text: MANNSCHAFT_TEXT.interesse, ton: "gold" });
  if (k.aktuelle_mannschaft) marken.push({ text: `spielt in ${k.aktuelle_mannschaft}`, ton: "blau" });
  return marken;
}

/**
 * Link zum Anrufen. Leerzeichen, Klammern, Schrägstriche und Bindestriche
 * fallen weg, ein führendes + bleibt. Ohne eine einzige Ziffer: null.
 */
export function telefonHref(nummer: string | null | undefined): string | null {
  if (!nummer) return null;
  const roh = nummer.trim();
  const plus = roh.startsWith("+") ? "+" : roh.startsWith("00") ? "+" : "";
  let ziffern = roh.replace(/\D/g, "");
  if (plus && roh.startsWith("00")) ziffern = ziffern.slice(2);
  return ziffern ? `tel:${plus}${ziffern}` : null;
}

/** Kurzfassung unter dem Eintrag "Mannschaft" im Konto. */
export function mannschaftKurzfassung(
  m: Pick<MeineMannschaft, "name" | "ich_bin_mf" | "offene_einladungen"> | null,
  einladungen: number,
): string | undefined {
  const teile: string[] = [];
  if (m) {
    teile.push(m.ich_bin_mf ? `${m.name} · Mannschaftsführer` : m.name);
    const offen = m.offene_einladungen.length;
    if (m.ich_bin_mf && offen > 0) teile.push(offen === 1 ? "1 Einladung offen" : `${offen} Einladungen offen`);
  }
  if (einladungen > 0) teile.push(einladungen === 1 ? "1 neue Einladung" : `${einladungen} neue Einladungen`);
  return teile.length ? teile.join(" · ") : undefined;
}

/** Steht "Mannschaft" im Konto? Mit Mannschaft oder mit offener Einladung. */
export function mannschaftEintragSichtbar(m: MeineMannschaft | null, einladungen: number): boolean {
  return m !== null || einladungen > 0;
}

/** Hinweis auf der Admin-Mitgliederseite beim MF. */
export function mannschaftsfuehrerHinweis(mannschaft: string): string {
  return `Mannschaftsführer ${mannschaft}: darf in seine Mannschaft einladen und Spieler austragen`;
}

// ---------------------------------------------------------------------------
// Lesen der RPC-Antworten
// ---------------------------------------------------------------------------

function text(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function textOderNull(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

function liste(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null) : [];
}

/**
 * meine_mannschaft() liefert jsonb. Was fehlt oder falsch getypt ist, fällt
 * auf einen sicheren Wert zurück, statt die Seite umzuwerfen.
 */
export function meineMannschaftLesen(roh: unknown): MeineMannschaft | null {
  if (typeof roh !== "object" || roh === null || Array.isArray(roh)) return null;
  const o = roh as Record<string, unknown>;
  const teamId = text(o.team_id);
  if (!teamId) return null;
  return {
    team_id: teamId,
    name: text(o.name),
    ich_bin_mf: o.ich_bin_mf === true,
    telefon_sichtbar: o.telefon_sichtbar === true,
    kader: liste(o.kader).map((k) => ({
      member_id: text(k.member_id),
      first_name: text(k.first_name),
      last_name: text(k.last_name),
      tennis_lk: textOderNull(k.tennis_lk),
      is_team_captain: k.is_team_captain === true,
      telefon: textOderNull(k.telefon),
    })),
    offene_einladungen: liste(o.offene_einladungen).map((e) => ({
      id: text(e.id),
      member_id: text(e.member_id),
      first_name: text(e.first_name),
      last_name: text(e.last_name),
      created_at: text(e.created_at),
      expires_at: text(e.expires_at),
    })),
  };
}
