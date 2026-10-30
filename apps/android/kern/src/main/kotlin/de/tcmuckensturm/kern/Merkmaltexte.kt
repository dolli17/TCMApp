/*
 * Forderungsarten und Beschreibungen der Einwilligungen
 *
 * Portierung von CHARGE_KIND_LABEL (packages/core/src/forderungen.ts) und
 * merkmalBeschreibung (packages/core/src/merkmaltexte.ts), wie
 * Kern/Merkmaltexte.swift der iOS-App. Geprueft gegen die Golden Files
 * CHARGE_KIND_LABEL.json und merkmalBeschreibung.json (KontoGoldenTest).
 */

package de.tcmuckensturm.kern

object Forderungen {
    /** In der Reihenfolge von CHARGE_KINDS. */
    val arten: List<Pair<String, String>> = listOf(
        "fee" to "Beitrag",
        "drinks" to "Getränke",
        "work_duty" to "Arbeitsdienst",
        "event" to "Veranstaltung",
        "guest" to "Gastgebühr",
        "deposit" to "Pfand",
        "misc" to "Sonstiges",
    )

    /** Unbekannte Arten zeigt die App mit ihrem Code (wie `?? f.kind` in konto.tsx). */
    fun chargeKindLabel(kind: String): String? = arten.firstOrNull { it.first == kind }?.second
}

object Merkmaltexte {
    enum class Sicht(val wert: String) {
        MITGLIED("mitglied"),
        VERWALTUNG("verwaltung"),
        ;

        companion object {
            fun aus(wert: String): Sicht? = entries.firstOrNull { it.wert == wert }
        }
    }

    /** Die Ausgangstexte aus Seed und Migration, an denen ein Ersatz haengt. */
    val ausgang = mapOf(
        "foto" to
            "Darf die Person auf Fotos der Website, in Aushängen und in der Presse erscheinen? " +
            "Bei Minderjährigen erteilen die Erziehungsberechtigten die Einwilligung.",
        "mannschaft_interesse" to "Die Person möchte in einer Mannschaft spielen. Der Sportwart meldet sich.",
        "booking_mail" to
            "Ob Änderungen an deinen Platzbuchungen zusätzlich per E-Mail kommen. " +
            "In der App siehst du sie in jedem Fall.",
    )

    val ersatz: Map<String, Map<Sicht, String>> = mapOf(
        "foto" to mapOf(
            Sicht.MITGLIED to
                "Dürfen wir dich auf Fotos der Website, in Aushängen und in der Presse zeigen? " +
                "Bei Minderjährigen willigen die Erziehungsberechtigten ein.",
        ),
        "mannschaft_interesse" to mapOf(
            Sicht.MITGLIED to "Du möchtest in einer Mannschaft spielen. Der Sportwart meldet sich bei dir.",
        ),
        "booking_mail" to mapOf(
            Sicht.VERWALTUNG to
                "Ob Änderungen an den Platzbuchungen des Mitglieds zusätzlich per E-Mail kommen. " +
                "In der App sieht es sie in jedem Fall.",
        ),
    )

    /** Die Beschreibung eines Merkmals in der Anrede der Sicht (U71). */
    fun merkmalBeschreibung(code: String, beschreibung: String, sicht: Sicht): String {
        // Alte Datenbestaende tragen den Text noch ohne Umlaute (vor 20261022120000).
        fun gleich(a: String, b: String): Boolean {
            val t = Profil.trim(a)
            return t == b || t == ohneUmlaute(b)
        }
        val neu = ersatz[code]?.get(sicht)
        val alt = ausgang[code]
        if (neu != null && alt != null && gleich(beschreibung, alt)) return neu
        return beschreibung
    }

    fun ohneUmlaute(s: String): String {
        var t = s
        for ((von, nach) in listOf("ä" to "ae", "ö" to "oe", "ü" to "ue", "Ä" to "Ae", "Ö" to "Oe", "Ü" to "Ue", "ß" to "ss")) {
            t = t.replace(von, nach)
        }
        return t
    }
}
