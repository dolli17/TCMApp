"use client";

import { useEffect, useState } from "react";

export type ThemeWahl = "system" | "hell" | "dunkel";

const COOKIE = "tcm-theme";

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
    var wahl = m ? decodeURIComponent(m[1]) : "system";
    if (wahl === "hell" || wahl === "dunkel") {
      document.documentElement.setAttribute("data-theme", wahl);
    }
  } catch (e) {}
})();
`.trim();

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
