"use client";

import { useEffect, useState } from "react";

export type ThemeWahl = "system" | "hell" | "dunkel";

const COOKIE = "tcm-theme";

/** Die Verwaltung ist hell, solange niemand etwas anderes gewaehlt hat. */
const VERWALTUNG = /^\/admin(\/|$)/;

/**
 * Wird beim ersten Rendern im <head> ausgeführt, noch bevor der Körper
 * gezeichnet wird. Ohne das blitzt beim Laden kurz das helle Theme auf, bevor
 * Dunkel greift - besonders unangenehm abends auf der Anlage.
 *
 * Bewusst kein React: das hier muss laufen, bevor irgendetwas hydriert.
 */
export const THEME_SKRIPT = `
(function () {
  try {
    var m = document.cookie.match(/(?:^|;\\s*)${COOKIE}=([^;]*)/);
    var wahl = m ? decodeURIComponent(m[1]) : "";
    if (wahl === "hell" || wahl === "dunkel") {
      document.documentElement.setAttribute("data-theme", wahl);
    } else if (!wahl && ${VERWALTUNG}.test(location.pathname)) {
      document.documentElement.setAttribute("data-theme", "hell");
    }
  } catch (e) {}
})();
`.trim();

/** Hat der Nutzer ausdruecklich gewaehlt - auch "System"? */
function eigeneWahl(): boolean {
  return new RegExp(`(?:^|;\\s*)${COOKIE}=`).test(document.cookie);
}

/**
 * Setzt in der Verwaltung hell, solange kein Theme gewaehlt ist, und nimmt
 * es beim Verlassen wieder weg. Das Kopfskript deckt das erste Laden ab,
 * dies hier den Wechsel innerhalb der Seite.
 */
export function VerwaltungHell() {
  useEffect(() => {
    if (eigeneWahl()) return;
    const html = document.documentElement;
    html.setAttribute("data-theme", "hell");
    return () => {
      if (!eigeneWahl()) html.removeAttribute("data-theme");
    };
  }, []);
  return null;
}

function schreibeCookie(wahl: ThemeWahl) {
  // Ein Jahr haltbar, gilt für die ganze Seite, kein Drittanbieter-Versand.
  document.cookie = `${COOKIE}=${wahl}; path=/; max-age=31536000; samesite=lax`;
}

export function ThemeUmschalter() {
  const [wahl, setWahl] = useState<ThemeWahl>("system");

  useEffect(() => {
    const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]*)`));
    if (m?.[1] === "hell" || m?.[1] === "dunkel") setWahl(m[1] as ThemeWahl);
  }, []);

  function waehle(neu: ThemeWahl) {
    setWahl(neu);
    schreibeCookie(neu);
    if (neu === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", neu);
    }
  }

  const optionen: { wert: ThemeWahl; label: string }[] = [
    { wert: "hell", label: "Hell" },
    { wert: "system", label: "System" },
    { wert: "dunkel", label: "Dunkel" },
  ];

  return (
    <div className="segtoggle" role="group" aria-label="Erscheinungsbild">
      {optionen.map((o) => (
        <button
          key={o.wert}
          type="button"
          aria-pressed={wahl === o.wert}
          onClick={() => waehle(o.wert)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
