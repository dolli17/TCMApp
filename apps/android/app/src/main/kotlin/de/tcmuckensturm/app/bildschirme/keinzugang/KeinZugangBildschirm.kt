/*
 * Kein Zugang mehr (B22)
 *
 * Wie apps/mobile/app/kein-zugang.tsx und KeinZugangBildschirm.swift der
 * iOS-App. Die Weiche hat schon abgemeldet (Sitzung.entscheiden); hier steht,
 * warum, und wie man den Vorstand erreicht.
 */

package de.tcmuckensturm.app.bildschirme.keinzugang

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.unit.sp
import de.tcmuckensturm.app.bildschirme.anmeldung.AnmeldeSeite
import de.tcmuckensturm.app.bildschirme.anmeldung.GelberKnopf
import de.tcmuckensturm.app.bildschirme.anmeldung.LeiserVerweis
import de.tcmuckensturm.app.start.LocalSitzung
import de.tcmuckensturm.app.theme.TcmSchrift
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.app.ui.tokens.Abstand
import de.tcmuckensturm.app.ui.tokens.Schrift
import de.tcmuckensturm.kern.KeinZugang
import de.tcmuckensturm.kern.ZugangsGrund

@Composable
fun KeinZugangBildschirm(grund: ZugangsGrund) {
    val sitzung = LocalSitzung.current
    KeinZugangInhalt(
        grund = grund,
        // Der Kontakt steht im Impressum; ohne Adresse (lokal) fuehrt der Knopf zur Anmeldung.
        kontakt = sitzung.umgebung.webLink("/impressum#kontakt"),
        zurAnmeldung = sitzung::zurAnmeldung,
    )
}

@Composable
fun KeinZugangInhalt(grund: ZugangsGrund, kontakt: String?, zurAnmeldung: () -> Unit) {
    val links = LocalUriHandler.current
    AnmeldeSeite(titel = KeinZugang.TITEL, unterzeile = KeinZugang.text(grund)) {
        Text(
            "${KeinZugang.KONTAKT} Du bist abgemeldet.",
            style = TcmSchrift.text(Schrift.gewichtNormal, 16.sp).copy(lineHeight = 24.sp),
            color = TcmTheme.farben.ink2,
            modifier = Modifier.fillMaxWidth(),
        )
        Column(Modifier.padding(top = Abstand.abschnitt), verticalArrangement = Arrangement.spacedBy(Abstand.l)) {
            if (kontakt != null) {
                GelberKnopf("Vorstand kontaktieren") { links.openUri(kontakt) }
                LeiserVerweis("Mit einem anderen Konto anmelden", aktion = zurAnmeldung)
            } else {
                GelberKnopf("Zur Anmeldung", aktion = zurAnmeldung)
            }
        }
    }
}
