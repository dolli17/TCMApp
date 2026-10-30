# R8 fuer Release (assembleProdRelease, bundleProdRelease).
#
# kotlinx.serialization, Ktor, OkHttp, supabase-kt und Firebase bringen ihre
# eigenen Regeln in den Bibliotheken mit (META-INF/com.android.tools/...).
# Hier steht nur, was die App darueber hinaus braucht. Geprueft mit
# `./gradlew :app:assembleProdRelease -Ptcm.prodBackend=dev` und dem Start
# der Variante im Emulator.

# ---- kotlinx.serialization: eigene Modelle ---------------------------------
# Die Bibliothek haelt serializer() fuer Klassen mit @Serializable, solange der
# Aufruf sichtbar ist. Unsere Modelle (daten/, kern/, Navigationsziele) laufen
# aber auch ueber Typ-Parameter der RPC-Aufrufe (decodeList<T>(), decodeAs<T>())
# und ueber die Routen von Navigation (serializer<T>() zur Laufzeit).
-keepattributes RuntimeVisibleAnnotations,AnnotationDefault,InnerClasses,Signature,EnclosingMethod

-if @kotlinx.serialization.Serializable class de.tcmuckensturm.**
-keepclassmembers class <1> {
    static <1>$Companion Companion;
}
-if @kotlinx.serialization.Serializable class de.tcmuckensturm.** {
    static **$* *;
}
-keepclassmembers class <2>$<3> {
    kotlinx.serialization.KSerializer serializer(...);
}
-if @kotlinx.serialization.Serializable class de.tcmuckensturm.**
-keepclassmembers class <1> {
    public static <1> INSTANCE;
    kotlinx.serialization.KSerializer serializer(...);
}
# Die erzeugten $$serializer-Klassen samt Feldnamen (SerialName) bleiben.
-keep,includedescriptorclasses class de.tcmuckensturm.**$$serializer { *; }

# ---- Ktor / supabase-kt ----------------------------------------------------------
# Ktor verweist auf JVM-Klassen, die es auf Android nicht gibt (Debug-Erkennung, SLF4J).
-dontwarn java.lang.management.ManagementFactory
-dontwarn java.lang.management.RuntimeMXBean
-dontwarn org.slf4j.impl.StaticLoggerBinder
-dontwarn org.slf4j.**

# ---- Fehlermeldungen ------------------------------------------------------------
# Zeilennummern in Absturzberichten, Dateinamen ohne Bedeutung.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
