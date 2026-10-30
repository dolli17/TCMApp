/*
 * Verschluesselung der Sitzung mit einem Schluessel aus dem Android Keystore
 *
 * AES-256-GCM, der Schluessel entsteht im Keystore und verlaesst ihn nie
 * (auf Geraeten mit StrongBox/TEE in der Hardware). Statt der veralteten
 * EncryptedSharedPreferences: DataStore haelt den Geheimtext, diese Klasse
 * ver- und entschluesselt (Sitzungsspeicher).
 *
 * Getrennt in den Algorithmus (AesGcm) und die Herkunft des Schluessels,
 * damit die Tests mit einem Schluessel aus Software laufen - Robolectric
 * kennt den AndroidKeyStore nicht.
 */

package de.tcmuckensturm.app.daten

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

interface Verschluesselung {
    fun verschluesseln(klartext: ByteArray): ByteArray

    /** Wirft, wenn der Geheimtext nicht zu diesem Schluessel passt oder veraendert wurde. */
    fun entschluesseln(geheimtext: ByteArray): ByteArray
}

/** AES-GCM; vor dem Geheimtext steht der Initialisierungsvektor (12 Byte). */
class AesGcm(private val schluessel: () -> SecretKey) : Verschluesselung {
    override fun verschluesseln(klartext: ByteArray): ByteArray {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        // Den IV waehlt der Keystore selbst (zufaellig); vorgeben darf man ihn dort nicht.
        cipher.init(Cipher.ENCRYPT_MODE, schluessel())
        val iv = cipher.iv
        check(iv.size == IV_LAENGE) { "Unerwartete IV-Laenge ${iv.size}" }
        return iv + cipher.doFinal(klartext)
    }

    override fun entschluesseln(geheimtext: ByteArray): ByteArray {
        require(geheimtext.size > IV_LAENGE) { "Geheimtext zu kurz" }
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(
            Cipher.DECRYPT_MODE,
            schluessel(),
            GCMParameterSpec(TAG_BITS, geheimtext, 0, IV_LAENGE),
        )
        return cipher.doFinal(geheimtext, IV_LAENGE, geheimtext.size - IV_LAENGE)
    }

    companion object {
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_LAENGE = 12
        const val TAG_BITS = 128
    }
}

/** Der Schluessel im Android Keystore; beim ersten Zugriff angelegt. */
object KeystoreSchluessel {
    private const val ANBIETER = "AndroidKeyStore"

    /** Fest - App und spaeter das Glance-Widget (gleicher Prozess) lesen damit dieselbe Sitzung. */
    const val ALIAS = "tcm-sitzung"

    @Synchronized
    fun holen(alias: String = ALIAS): SecretKey {
        val speicher = KeyStore.getInstance(ANBIETER).apply { load(null) }
        (speicher.getKey(alias, null) as? SecretKey)?.let { return it }
        val erzeuger = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANBIETER)
        erzeuger.init(
            KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                // Ohne Entsperr-Pflicht: die Sitzung muss sich auch im Hintergrund erneuern
                // lassen (wie kSecAttrAccessibleAfterFirstUnlock in der iOS-App).
                .setUserAuthenticationRequired(false)
                .build(),
        )
        return erzeuger.generateKey()
    }

    fun verschluesselung(): Verschluesselung = AesGcm { holen() }
}
