/*
 * Ansichtslogik des Onboardings als reine Funktionen
 *
 * Wie Bildschirme/Onboarding/OnboardingLogik.swift der iOS-App: Texte
 * wortgleich aus apps/mobile/app/onboarding.tsx, die Pruefungen aus
 * apps/mobile/src/lib/daten.ts (pruefeOnboardingStammdaten,
 * speichereErziehungsberechtigte) und die Datumswandlung aus
 * src/lib/verwaltung/gemeinsam.ts (isoZuDeutsch, deutschZuIso).
 */

package de.tcmuckensturm.app.bildschirme.onboarding

import de.tcmuckensturm.app.daten.OnboardingZustand
import de.tcmuckensturm.kern.Onboarding
import de.tcmuckensturm.kern.OnboardingSchritt
import de.tcmuckensturm.kern.OnboardingSchrittKey
import de.tcmuckensturm.kern.Profil
import de.tcmuckensturm.kern.Zeit
import java.time.DateTimeException
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

object OnboardingLogik {
    const val KICKER = "Konto einrichten"
    const val FREIGESCHALTET = "Dein Konto ist freigeschaltet. Die nächsten Schritte sind freiwillig."

    /** Was unter dem Titel steht - je Schritt ein Satz, warum es ihn gibt. */
    fun einleitung(key: OnboardingSchrittKey, minderjaehrig: Boolean): String = when (key) {
        OnboardingSchrittKey.PASSWORT -> "Lege ein Passwort für dein Konto fest."
        OnboardingSchrittKey.STAMMDATEN ->
            "Bitte prüfe deine Angaben und korrigiere, was nicht stimmt. Geburtsdatum und Geschlecht kannst du nur jetzt selbst ändern, später über den Vorstand."
        OnboardingSchrittKey.RECHTLICHES ->
            "Satzung und Beitragsordnung gelten für alle Mitglieder. Wir speichern, welcher Fassung du wann zugestimmt hast."
        OnboardingSchrittKey.ERZIEHUNGSBERECHTIGTE ->
            "Du bist noch nicht volljährig. Deshalb brauchen wir die Angaben einer erziehungsberechtigten Person und ihre Zustimmung zur Mitgliedschaft."
        OnboardingSchrittKey.NOTFALLKONTAKT ->
            if (minderjaehrig) {
                "Wen sollen wir anrufen, wenn auf der Anlage etwas passiert? Bei Minderjährigen ist das Pflicht; vorbelegt sind die Erziehungsberechtigten."
            } else {
                "Wen sollen wir anrufen, wenn auf der Anlage etwas passiert? Freiwillig – du kannst den Schritt überspringen."
            }
        OnboardingSchrittKey.SEPA -> "Der Verein zieht Beiträge per Lastschrift ein. Mit dem Mandat ist dein Konto freigeschaltet."
        OnboardingSchrittKey.EINWILLIGUNGEN -> "Freiwillig. Nichts ist vorausgewählt, und du kannst alles später im Konto ändern."
        OnboardingSchrittKey.TENNIS -> "Freiwillig. Das hilft bei der Planung der Mannschaften."
        OnboardingSchrittKey.EINSTELLUNGEN ->
            "Freiwillig. Wie wir dich über deine Buchungen informieren – auch das kannst du später im Konto ändern."
    }

    fun kopfKicker(index: Int, anzahl: Int): String = "$KICKER · Schritt ${index + 1} von $anzahl"

    enum class Fortschritt { ERLEDIGT, JETZT, OFFEN }

    fun fortschritt(schritte: List<OnboardingSchritt>, index: Int): List<Fortschritt> =
        schritte.mapIndexed { i, s ->
            when {
                i == index -> Fortschritt.JETZT
                s.erledigt -> Fortschritt.ERLEDIGT
                else -> Fortschritt.OFFEN
            }
        }

    data class Stelle(val key: OnboardingSchrittKey, val index: Int)

    /**
     * Wo der Assistent steht: der gewaehlte Schritt, sonst der erste offene
     * Pflichtschritt, sonst das Mandat. Faellt der gewaehlte weg (etwa die
     * Erziehungsberechtigten nach einem neuen Geburtsdatum), der erste.
     */
    fun aktuell(gewaehlt: OnboardingSchrittKey?, zustand: OnboardingZustand): Stelle {
        val key = gewaehlt ?: zustand.naechsterPflichtschritt ?: Onboarding.letzterPflichtschritt
        val schritte = zustand.schritte
        val index = schritte.indexOfFirst { it.key == key }.coerceAtLeast(0)
        return Stelle(schritte[index].key, index)
    }

    /** Nach der Freischaltung fuehrt kein Weg zurueck in die Pflicht: die RPCs dort lehnen dann ab. */
    fun ersterErreichbarer(schritte: List<OnboardingSchritt>, freigeschaltet: Boolean): Int {
        if (!freigeschaltet) return 0
        val sepa = schritte.indexOfFirst { it.key == Onboarding.letzterPflichtschritt }
        return if (sepa < 0) 0 else sepa + 1
    }

    /** Die fehlenden Schritte aus dem DETAIL von complete_onboarding ("stammdaten, sepa"). */
    fun fehlendeSchritte(details: String?): List<OnboardingSchrittKey> =
        (details ?: "")
            .split(",")
            .mapNotNull { OnboardingSchrittKey.aus(it.trim()) }
            .filter { it in Onboarding.pflichtKeys }

    // ---- Rechtliches ------------------------------------------------------------

    /** Satzung und Beitragsordnung werden akzeptiert, die Datenschutzerklaerung zur Kenntnis genommen. */
    fun zustimmungstext(code: String, titel: String): String =
        if (code == "datenschutz") "Ich habe die $titel zur Kenntnis genommen." else "Ich akzeptiere die $titel."

    fun fassung(d: OnboardingZustand.Dokument): String {
        val version = d.version?.toString() ?: "–"
        return "Fassung $version vom ${isoZuDeutsch(d.validFrom)}" + if (d.zugestimmtAm != null) " · bereits zugestimmt" else ""
    }

    const val ALLE_ZUSTIMMEN = "Bitte stimme allen drei Texten zu."

    // ---- Stammdaten -------------------------------------------------------------

    val geschlechter: List<Pair<String, String>> = listOf("female" to "weiblich", "male" to "männlich", "diverse" to "divers")

    /** Die Werte fuer das Formular, Schluessel = Spaltenname; das Geburtsdatum als TT.MM.JJJJ. */
    fun stammdatenWerte(s: OnboardingZustand.Stammdaten): Map<String, String> = mapOf(
        "first_name" to (s.firstName ?: ""), "last_name" to (s.lastName ?: ""), "title" to (s.title ?: ""),
        "birthday" to isoZuDeutsch(s.birthday), "gender" to (s.gender ?: ""),
        "street" to (s.street ?: ""), "postcode" to (s.postcode ?: ""), "city" to (s.city ?: ""),
        "phone" to (s.phone ?: ""), "mobile" to (s.mobile ?: ""),
    )

    sealed interface Pruefung {
        /** Mit dem Geburtsdatum als JJJJ-MM-TT */
        data class Ok(val geburtstag: String) : Pruefung
        data class Fehler(val fehler: Profil.Fehler) : Pruefung
    }

    /**
     * Dieselben Pflichten wie onboarding_save_stammdaten, aber mit dem Feld,
     * das fehlt. Die Datenbank meldet nur "Pflichtangaben fehlen: …".
     */
    fun pruefeStammdaten(w: Map<String, String>, heute: String = Zeit.berlinDay(Instant.now())): Pruefung {
        val leer = { feld: String -> Profil.trim(w[feld] ?: "").isEmpty() }
        val fehlt = { feld: String, meldung: String -> Pruefung.Fehler(Profil.Fehler(feld, meldung)) }
        if (leer("first_name")) return fehlt("first_name", "Vorname fehlt.")
        if (leer("last_name")) return fehlt("last_name", "Nachname fehlt.")

        val geburtstag = deutschZuIso(w["birthday"] ?: "")
            ?: return fehlt("birthday", "Bitte das Geburtsdatum als TT.MM.JJJJ angeben.")
        // deutschZuIso liest "85" als 2085 - bei einem Geburtsdatum nie gemeint.
        if (geburtstag > heute) {
            return fehlt("birthday", "Das Geburtsdatum liegt in der Zukunft. Bitte das Jahr vierstellig angeben.")
        }
        if (geburtstag < "1900-01-01") return fehlt("birthday", "Bitte ein gültiges Geburtsdatum angeben.")
        if (leer("gender")) return fehlt("gender", "Bitte das Geschlecht wählen.")

        if (leer("street")) return fehlt("street", "Straße fehlt.")
        if (leer("postcode")) return fehlt("postcode", "Postleitzahl fehlt.")
        if (leer("city")) return fehlt("city", "Ort fehlt.")
        if (leer("phone") && leer("mobile")) return fehlt("phone", "Bitte Telefon oder Mobil angeben.")
        return Pruefung.Ok(geburtstag)
    }

    fun pruefeErziehungsberechtigte(name: String, email: String, telefon: String): Profil.Fehler? {
        if (Profil.trim(name).isEmpty()) return Profil.Fehler("name", "Bitte den Namen angeben.")
        if (Profil.trim(email).isEmpty() && Profil.trim(telefon).isEmpty()) {
            return Profil.Fehler("email", "Bitte E-Mail oder Telefon angeben.")
        }
        return null
    }

    // ---- Notfallkontakt ---------------------------------------------------------

    data class Notfall(val name: String, val telefon: String, val verhaeltnis: String)

    /** Bei Minderjaehrigen mit den Erziehungsberechtigten vorbelegt, solange noch nichts eingetragen ist. */
    fun notfallVorbelegung(z: OnboardingZustand): Notfall {
        val n = z.notfallkontakt
        val e = z.erziehungsberechtigte
        val vorbelegen = z.minderjaehrig && n.name.isNullOrEmpty() && n.phone.isNullOrEmpty()
        if (!vorbelegen) return Notfall(n.name ?: "", n.phone ?: "", n.relation ?: "")
        val hatName = !e.name.isNullOrEmpty()
        return Notfall(e.name ?: "", e.phone ?: "", if (hatName) "Erziehungsberechtigte" else n.relation ?: "")
    }

    // ---- Mandat -----------------------------------------------------------------

    fun mandatstext(m: OnboardingZustand.Mandat): String =
        m.text ?: Onboarding.mandatstext(m.glaeubigerName ?: "", m.glaeubigerId ?: "", m.referenz ?: "")

    // ---- Einstellungen ----------------------------------------------------------

    /**
     * Die Werte von booking_mail. Sie stehen in member_attribute_options;
     * ohne Wert gilt "Nur Wichtiges".
     */
    val buchungsmails: List<Pair<String, String>> = listOf("alle" to "Alle", "wichtige" to "Nur Wichtiges", "keine" to "Keine")

    fun buchungsmail(gespeichert: String?): String =
        if (buchungsmails.any { it.first == gespeichert }) gespeichert!! else "wichtige"

    /** Gespeichert wird, wenn sich etwas geaendert hat oder noch gar nichts gesetzt ist. */
    fun buchungsmailSpeichern(gewaehlt: String, gespeichert: String?): Boolean =
        gespeichert == null || gewaehlt != buchungsmail(gespeichert)

    // ---- Datum ------------------------------------------------------------------

    /** 2026-09-29 -> 29.09.2026; ohne Wert leer. */
    fun isoZuDeutsch(iso: String?): String {
        if (iso.isNullOrEmpty()) return ""
        val teile = iso.take(10).split("-")
        if (teile.size != 3 || teile.any { it.isEmpty() }) return iso
        return "${teile[2]}.${teile[1]}.${teile[0]}"
    }

    private val isoForm = Regex("^[0-9]{4}-[0-9]{2}-[0-9]{2}$")
    private val deutschForm = Regex("^([0-9]{1,2})\\.([0-9]{1,2})\\.([0-9]{2}|[0-9]{4})$")

    /** 29.09.2026 (auch 29.9.26) -> 2026-09-29. Ungueltiges gibt null. */
    fun deutschZuIso(text: String): String? {
        val t = text.trim()
        if (isoForm.matches(t)) return t
        val m = deutschForm.matchEntire(t) ?: return null
        val (tag, monat, jahrText) = m.destructured
        val jahr = if (jahrText.length == 2) 2000 + jahrText.toInt() else jahrText.toInt()
        return try {
            LocalDate.of(jahr, monat.toInt(), tag.toInt()).toString()
        } catch (e: DateTimeException) {
            null
        }
    }

    /** Fuer den Datumswaehler (Millisekunden um Mitternacht UTC): TT.MM.JJJJ <-> Tag. */
    fun millis(ausDeutsch: String): Long? =
        deutschZuIso(ausDeutsch)?.let { LocalDate.parse(it).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli() }

    fun deutsch(millis: Long): String =
        isoZuDeutsch(Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate().toString())
}
