package de.tcmuckensturm.app.bildschirme.konto

import androidx.compose.runtime.Composable
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.github.takahirom.roborazzi.captureRoboImage
import de.tcmuckensturm.app.daten.Arbeitsdienst
import de.tcmuckensturm.app.daten.EigenesGetraenk
import de.tcmuckensturm.app.daten.Ergebnis
import de.tcmuckensturm.app.daten.Forderung
import de.tcmuckensturm.app.daten.MeinMandat
import de.tcmuckensturm.app.daten.MeinProfil
import de.tcmuckensturm.app.daten.MerkmalZeile
import de.tcmuckensturm.app.theme.Erscheinungsbild
import de.tcmuckensturm.app.theme.TcmTheme
import java.time.Instant
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Beispieldaten fuer die Bildschirmfotos - kein Netz. */
object KontoBeispiel {
    val profil = MeinProfil(
        firstName = "Anna", lastName = "Meier", phone = "0711 123456", mobile = "0170 1234567",
        street = "Bahnhofstr. 20", postcode = "71711", city = "Murr",
        emergencyContactName = "Jonas Meier", emergencyContactPhone = "0170 7654321", emergencyContactRelation = "Bruder",
        membershipNumber = "0042", memberSince = "2019-04-01", teamName = "Damen 30", isTeamCaptain = true,
    )

    val inhalt = KontoInhalt(
        profil = Abschnitt.Wert(profil),
        forderungen = Abschnitt.Wert(
            listOf(
                Forderung("1", kind = "fee", description = "Jahresbeitrag Erwachsene", periodLabel = "2026", amountCents = 18000, dueDate = "2026-11-02", status = "notified"),
                Forderung("2", kind = "drinks", periodLabel = "September 2026", amountCents = 1350, status = "returned"),
                Forderung("3", kind = "guest", amountCents = 500, status = "paid"),
            ),
        ),
        getraenke = Abschnitt.Wert(
            listOf(
                EigenesGetraenk("g1", itemName = "Apfelschorle", quantity = 2, totalCents = 500),
                EigenesGetraenk("g2", itemName = "Wasser", quantity = 1, totalCents = 150),
                EigenesGetraenk("g3", itemName = "Bier", quantity = 1, totalCents = 300, voidedAt = "2026-10-12T18:00:00Z"),
            ),
        ),
        dienst = Abschnitt.Wert(Arbeitsdienst(year = 2026, requiredHours = 10.0, completedHours = 6.5, missingHours = 3.5)),
        mandat = Abschnitt.Wert(
            MeinMandat(reference = "TCM-0042", signedOn = "2024-03-01", status = "active", holder = "Anna Meier", bankName = "Volksbank Backnang", ibanLast4 = "4321"),
        ),
        merkmale = Abschnitt.Wert(
            listOf(
                MerkmalZeile(
                    code = "foto", name = "Fotos",
                    description = "Darf die Person auf Fotos der Website, in Aushängen und in der Presse erscheinen? Bei Minderjährigen erteilen die Erziehungsberechtigten die Einwilligung.",
                    valueKind = "boolean", optionValue = "true", setAt = "2026-05-01T10:00:00+00:00", selfEditable = true, darfIch = true,
                ),
                MerkmalZeile(
                    code = "mannschaft_interesse", name = "Mannschaft",
                    description = "Die Person möchte in einer Mannschaft spielen. Der Sportwart meldet sich.",
                    valueKind = "boolean", selfEditable = true, darfIch = true,
                ),
                MerkmalZeile(
                    code = "helfen", name = "Mithelfen bei", valueKind = "list", multiple = true,
                    optionen = listOf(MerkmalZeile.Option("fest", "Vereinsfest"), MerkmalZeile.Option("platz", "Platzpflege"), MerkmalZeile.Option("jugend", "Jugend")),
                    optionValue = "fest", optionLabel = "Vereinsfest", selfEditable = true, darfIch = true,
                ),
                MerkmalZeile(code = "ehrung", name = "Ehrung", valueKind = "text", textValue = "25 Jahre", selfEditable = true, darfIch = false),
            ),
        ),
    )

    /** Ein Fehler je Abschnitt: was geladen wurde, bleibt stehen. */
    val mitFehlern = inhalt.copy(
        forderungen = Abschnitt.Fehler("Keine Verbindung zum Server."),
        dienst = Abschnitt.Fehler("Keine Verbindung zum Server."),
    )

    val aktionen = object : KontoAktionen {
        override suspend fun speichereProfil(neu: Map<String, String>, alt: Map<String, String>) = Ergebnis.erfolg("Gespeichert.")
        override suspend fun speichereNotfallkontakt(werte: Map<String, String>) = Ergebnis.erfolg("Notfallkontakt gespeichert.")
        override suspend fun setzeMerkmal(code: String, option: String?, text: String?) = Ergebnis.erfolg("Gespeichert.")
        override suspend fun entferneMerkmal(code: String, option: String?) = Ergebnis.erfolg("Entfernt.")
        override suspend fun passwortSpeichern(neu: String): String? = null
        override suspend fun beantrageKontoloeschung(nachricht: String) = Ergebnis.erfolg("Dein Antrag ist eingegangen.")
    }

    val jetzt: Instant = Instant.parse("2026-10-30T10:00:00Z")
}

/**
 * Bildschirmfotos des Kontos ohne Geraet (Robolectric + Roborazzi), hell und
 * dunkel. Die Blaetter zeichnet der Test ohne das Bottom Sheet drumherum
 * (es oeffnet ein eigenes Fenster, das onRoot nicht sieht).
 * `./gradlew :app:recordRoborazziLokalDebug` schreibt die PNGs nach apps/android/docs.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w412dp-h915dp-xxhdpi")
class KontoBildfotoTest {
    @get:Rule val compose = createComposeRule()

    private fun foto(name: String, dunkel: Boolean, inhalt: @Composable () -> Unit) {
        compose.setContent { TcmTheme(dunkel = dunkel) { inhalt() } }
        compose.onRoot().captureRoboImage("../docs/$name.png")
    }

    @Composable
    private fun Seite(inhalt: KontoInhalt = KontoBeispiel.inhalt, erscheinungsbild: Erscheinungsbild = Erscheinungsbild.SYSTEM) =
        KontoAnsicht(
            zustand = KontoZustand(inhalt = inhalt, laedt = false),
            erscheinungsbild = erscheinungsbild,
            datenschutz = "https://dev.tennisclub-muckensturm.de/datenschutz",
            impressum = "https://dev.tennisclub-muckensturm.de/impressum",
            oeffnen = {},
            erneut = {},
            erscheinungsbildWaehlen = {},
            link = {},
            abmelden = {},
            jetzt = KontoBeispiel.jetzt,
        )

    @Composable
    private fun Blatt(art: KontoBlatt, inhalt: KontoInhalt = KontoBeispiel.inhalt) =
        KontoBlattInhalt(art, inhalt, "anna.meier@example.org", KontoBeispiel.aktionen, {}, {}, {}, {})

    @Test
    fun kontoHell() = foto("konto-hell", dunkel = false) { Seite() }

    @Test
    fun kontoDunkel() = foto("konto-dunkel", dunkel = true) { Seite(erscheinungsbild = Erscheinungsbild.DUNKEL) }

    @Test
    @Config(qualifiers = "w412dp-h2200dp-xxhdpi")
    fun kontoGanzHell() = foto("konto-ganz-hell", dunkel = false) { Seite() }

    @Test
    @Config(qualifiers = "w412dp-h2200dp-xxhdpi")
    fun kontoGanzDunkel() = foto("konto-ganz-dunkel", dunkel = true) { Seite(erscheinungsbild = Erscheinungsbild.DUNKEL) }

    @Test
    fun kontoMitFehlern() = foto("konto-fehler", dunkel = false) { Seite(KontoBeispiel.mitFehlern) }

    @Test
    fun kontoLaedt() = foto("konto-laedt", dunkel = false) {
        KontoAnsicht(KontoZustand(), Erscheinungsbild.SYSTEM, null, null, {}, {}, {}, {}, {})
    }

    @Test
    fun meineDatenHell() = foto("konto-daten-hell", dunkel = false) { Blatt(KontoBlatt.DATEN) }

    @Test
    fun meineDatenDunkel() = foto("konto-daten-dunkel", dunkel = true) { Blatt(KontoBlatt.DATEN) }

    @Test
    fun notfallkontakt() = foto("konto-notfall-hell", dunkel = false) { Blatt(KontoBlatt.NOTFALL) }

    @Test
    fun einwilligungenHell() = foto("konto-einwilligungen-hell", dunkel = false) { Blatt(KontoBlatt.EINWILLIGUNGEN) }

    @Test
    fun einwilligungenDunkel() = foto("konto-einwilligungen-dunkel", dunkel = true) { Blatt(KontoBlatt.EINWILLIGUNGEN) }

    @Test
    fun bankHell() = foto("konto-bank-hell", dunkel = false) { Blatt(KontoBlatt.BANK) }

    @Test
    fun bankDunkel() = foto("konto-bank-dunkel", dunkel = true) { Blatt(KontoBlatt.BANK) }

    @Test
    fun passwortHell() = foto("konto-passwort-hell", dunkel = false) { Blatt(KontoBlatt.PASSWORT) }

    @Test
    fun passwortDunkel() = foto("konto-passwort-dunkel", dunkel = true) { Blatt(KontoBlatt.PASSWORT) }

    @Test
    fun kuendigungHell() = foto("konto-kuendigung-hell", dunkel = false) { Blatt(KontoBlatt.LOESCHEN) }

    @Test
    fun kuendigungDunkel() = foto("konto-kuendigung-dunkel", dunkel = true) { Blatt(KontoBlatt.LOESCHEN) }
}
