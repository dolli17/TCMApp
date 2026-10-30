/*
 * Die Umgebung der App: gegen welches Supabase sie spricht
 *
 * Die Werte stehen je Variante (lokal, dev, prod) in app/build.gradle.kts und
 * kommen ueber BuildConfig in die App - dasselbe, was in der iOS-App die
 * xcconfig-Dateien und in der Expo-App EXPO_PUBLIC_* leisten. Auch hier nur
 * der oeffentliche Schluessel: was ein Mitglied sehen darf, entscheidet RLS.
 */

package de.tcmuckensturm.app.start

import de.tcmuckensturm.app.BuildConfig
import java.net.URI

data class Umgebung(
    val supabaseUrl: String,
    val supabaseKey: String,
    /** Basisadresse des Webs ohne Schraegstrich am Ende; null, wenn keine gesetzt ist (lokal). */
    val siteUrl: String?,
    /** Eigenes URL-Schema (tcm, tcmdev, tcmlokal); null, wenn keins gesetzt ist. */
    val urlSchema: String?,
) {
    sealed class Fehler(val schluessel: String) : Exception(schluessel) {
        class Fehlt(schluessel: String) : Fehler(schluessel)
        class Ungueltig(schluessel: String) : Fehler(schluessel)
    }

    /** "/antrag" -> "https://…/antrag"; ohne Basisadresse null (wie webLink in apps/mobile/src/lib/web.ts). */
    fun webLink(pfad: String): String? {
        val basis = siteUrl ?: return null
        return basis + if (pfad.startsWith("/")) pfad else "/$pfad"
    }

    /**
     * Wohin der Link aus "Passwort vergessen" fuehrt: <SITE_URL>/passwort-setzen
     * als App Link (oeffnet die App, sonst das Web). Ohne Webadresse (lokal) das
     * eigene Schema. Das Ziel muss in der Redirect-Allowlist des Supabase-Projekts
     * stehen, sonst schickt Auth auf die Site-URL.
     */
    val passwortRueckleitung: String?
        get() = webLink("/passwort-setzen") ?: urlSchema?.let { "$it://passwort-setzen" }

    companion object {
        const val SCHLUESSEL_URL = "SUPABASE_URL"
        const val SCHLUESSEL_KEY = "SUPABASE_KEY"

        /** Wirft, statt abzustuerzen: die App zeigt dann einen verstaendlichen Hinweis. */
        fun aus(url: String, key: String, site: String, schema: String): Umgebung {
            val u = url.trim()
            val k = key.trim()
            if (u.isEmpty()) throw Fehler.Fehlt(SCHLUESSEL_URL)
            if (k.isEmpty()) throw Fehler.Fehlt(SCHLUESSEL_KEY)
            val gueltig = runCatching { URI(u) }.getOrNull()
                ?.takeIf { it.scheme in setOf("http", "https") && !it.host.isNullOrEmpty() }
            if (gueltig == null) throw Fehler.Ungueltig(SCHLUESSEL_URL)
            return Umgebung(
                supabaseUrl = u,
                supabaseKey = k,
                siteUrl = site.trim().trimEnd('/').ifEmpty { null },
                urlSchema = schema.trim().ifEmpty { null },
            )
        }

        fun ausBuildConfig(): Umgebung =
            aus(BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_KEY, BuildConfig.SITE_URL, BuildConfig.URL_SCHEMA)
    }
}
