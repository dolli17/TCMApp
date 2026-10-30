/*
 * Onboarding nach dem ersten Login
 *
 * Portierung aus packages/core/src/onboarding.ts und iban.ts, wie
 * Kern/Onboarding.swift der iOS-App. Die Datenbank ist die Quelle der
 * Wahrheit: my_onboarding() liefert, welcher Schritt erledigt ist, und
 * complete_onboarding() prueft die Pflichtschritte noch einmal selbst. Hier
 * stehen Reihenfolge, Bezeichnungen und welche Schritte Pflicht sind, damit
 * Web und App denselben Assistenten zeigen.
 */

package de.tcmuckensturm.kern

/** Die Schritte in ihrer Reihenfolge; `wert` ist der Schluessel in der Datenbank. */
enum class OnboardingSchrittKey(val wert: String) {
    PASSWORT("passwort"),
    STAMMDATEN("stammdaten"),
    RECHTLICHES("rechtliches"),
    ERZIEHUNGSBERECHTIGTE("erziehungsberechtigte"),
    NOTFALLKONTAKT("notfallkontakt"),
    SEPA("sepa"),
    EINWILLIGUNGEN("einwilligungen"),
    TENNIS("tennis"),
    EINSTELLUNGEN("einstellungen"),
    ;

    companion object {
        fun aus(wert: String?): OnboardingSchrittKey? = entries.firstOrNull { it.wert == wert }
    }
}

data class OnboardingSchritt(
    val key: OnboardingSchrittKey,
    val titel: String,
    val pflicht: Boolean,
    val erledigt: Boolean,
)

object Onboarding {
    val titel: Map<OnboardingSchrittKey, String> = mapOf(
        OnboardingSchrittKey.PASSWORT to "Passwort",
        OnboardingSchrittKey.STAMMDATEN to "Deine Daten",
        OnboardingSchrittKey.RECHTLICHES to "Satzung und Datenschutz",
        OnboardingSchrittKey.ERZIEHUNGSBERECHTIGTE to "Erziehungsberechtigte",
        OnboardingSchrittKey.NOTFALLKONTAKT to "Notfallkontakt",
        OnboardingSchrittKey.SEPA to "SEPA-Lastschriftmandat",
        OnboardingSchrittKey.EINWILLIGUNGEN to "Einwilligungen",
        OnboardingSchrittKey.TENNIS to "Tennis",
        OnboardingSchrittKey.EINSTELLUNGEN to "App-Einstellungen",
    )

    /** Mit diesem Schritt ist das Konto freigeschaltet; danach ist alles optional. */
    val letzterPflichtschritt = OnboardingSchrittKey.SEPA

    /** Was complete_onboarding() in den details als fehlend nennen kann. */
    val pflichtKeys: List<OnboardingSchrittKey> = listOf(
        OnboardingSchrittKey.PASSWORT,
        OnboardingSchrittKey.STAMMDATEN,
        OnboardingSchrittKey.RECHTLICHES,
        OnboardingSchrittKey.ERZIEHUNGSBERECHTIGTE,
        OnboardingSchrittKey.NOTFALLKONTAKT,
        OnboardingSchrittKey.SEPA,
    )

    private val immerPflicht = setOf(
        OnboardingSchrittKey.PASSWORT,
        OnboardingSchrittKey.STAMMDATEN,
        OnboardingSchrittKey.RECHTLICHES,
        OnboardingSchrittKey.SEPA,
    )

    /**
     * Die Schritte in Reihenfolge (onboardingSchritte). Erziehungsberechtigte
     * gibt es nur bei Minderjaehrigen; dort ist auch der Notfallkontakt Pflicht.
     */
    fun schritte(minderjaehrig: Boolean, status: Map<String, Boolean>): List<OnboardingSchritt> =
        OnboardingSchrittKey.entries
            .filter { minderjaehrig || it != OnboardingSchrittKey.ERZIEHUNGSBERECHTIGTE }
            .map { key ->
                OnboardingSchritt(
                    key = key,
                    titel = titel[key] ?: key.wert,
                    pflicht = key in immerPflicht ||
                        (minderjaehrig && (key == OnboardingSchrittKey.ERZIEHUNGSBERECHTIGTE || key == OnboardingSchrittKey.NOTFALLKONTAKT)),
                    erledigt = status[key.wert] == true,
                )
            }

    /** Der erste offene Pflichtschritt, oder null, wenn alles Pflichtige erledigt ist. */
    fun naechsterPflichtschritt(minderjaehrig: Boolean, status: Map<String, Boolean>): OnboardingSchrittKey? =
        schritte(minderjaehrig, status).firstOrNull { it.pflicht && !it.erledigt }?.key

    /**
     * Der Text des SEPA-Basislastschriftmandats. Wortgleich mit
     * private.sepa_mandatstext in der Datenbank, die ihn beim Erteilen als
     * Nachweis speichert.
     */
    fun mandatstext(glaeubigerName: String, glaeubigerId: String, referenz: String): String =
        listOf(
            "SEPA-Lastschriftmandat (SEPA-Basislastschrift)",
            "",
            "Zahlungsempfänger: $glaeubigerName",
            "Gläubiger-Identifikationsnummer: $glaeubigerId",
            "Mandatsreferenz: $referenz",
            "Zahlungsart: Wiederkehrende Zahlungen",
            "",
            "Ich ermächtige $glaeubigerName, Zahlungen von meinem Konto mittels Lastschrift einzuziehen. " +
                "Zugleich weise ich mein Kreditinstitut an, die von $glaeubigerName auf mein Konto gezogenen Lastschriften einzulösen.",
            "",
            "Hinweis: Ich kann innerhalb von acht Wochen, beginnend mit dem Belastungsdatum, " +
                "die Erstattung des belasteten Betrages verlangen. Es gelten dabei die mit " +
                "meinem Kreditinstitut vereinbarten Bedingungen.",
        ).joinToString("\n")
}

/**
 * IBAN nach ISO 13616 (iban.ts). Dieselbe Pruefung gibt es als
 * Datenbankfunktion; hier nur, damit die Maske sofort reagiert.
 */
object Iban {
    /** Laenge je Land. Unvollstaendig, deckt aber ab, was im Verein vorkommt. */
    val laengen: Map<String, Int> = mapOf(
        "DE" to 22, "AT" to 20, "CH" to 21, "FR" to 27, "IT" to 27, "NL" to 18, "BE" to 16,
        "ES" to 24, "LU" to 20, "DK" to 18, "PL" to 28, "CZ" to 24, "GB" to 22, "SE" to 24,
    )

    private val form = Regex("^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$")

    fun normalisiert(eingabe: String): String = eingabe.filter { !it.isWhitespace() && it != '-' }.uppercase()

    fun istGueltig(eingabe: String?): Boolean {
        if (eingabe.isNullOrEmpty()) return false
        val iban = normalisiert(eingabe)
        if (!form.matches(iban)) return false
        val laenge = laengen[iban.take(2)]
        if (laenge != null && iban.length != laenge) return false

        // Modulo 97 stueckweise, Buchstaben zu Zahlen (A = 10 … Z = 35).
        var rest = 0
        for (zeichen in iban.drop(4) + iban.take(4)) {
            val wert = when (zeichen) {
                in '0'..'9' -> zeichen - '0'
                in 'A'..'Z' -> zeichen - 'A' + 10
                else -> return false
            }
            for (ziffer in wert.toString()) rest = (rest * 10 + (ziffer - '0')) % 97
        }
        return rest == 1
    }
}
