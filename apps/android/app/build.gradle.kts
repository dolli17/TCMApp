import com.android.build.api.variant.HostTestBuilder
import java.util.Properties

// Die Compose-App. Varianten, Werte und Signieren: apps/android/README.md.
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.roborazzi)
}

// ---- Werte je Umgebung -------------------------------------------------------

/** Dev-Projekt (Branch main), wie apps/ios/Konfiguration/Dev.xcconfig - oeffentlicher Publishable Key. */
object DevBackend {
    const val SUPABASE_URL = "https://xvjqqjiweogtfpfgeoqz.supabase.co"
    const val SUPABASE_KEY = "sb_publishable_Vrd1oT_d9KTwr9jfiT64Eg_LDW6IX1V"
    const val SITE_URL = "https://dev.tennisclub-muckensturm.de"
}

/** Lokal: Werte aus lokal.properties (gitignored, Vorlage lokal.properties.example). */
val lokal = Properties().apply {
    val datei = rootProject.file("lokal.properties")
    if (datei.exists()) datei.inputStream().use(::load)
}

/**
 * Prod-Paket gegen das Dev-Backend, wie apps/ios/Konfiguration/TestFlight.xcconfig:
 * `-Ptcm.prodBackend=dev`. Ohne die Property bleibt Prod leer (Hinweis "Konfiguration fehlt").
 */
val prodGegenDev = providers.gradleProperty("tcm.prodBackend").orNull == "dev"

fun String.alsBuildConfig() = "\"" + replace("\\", "\\\\").replace("\"", "\\\"") + "\""

/** Release-Signing nur ueber Properties oder Umgebung, nie aus dem Repo. */
fun wert(property: String, umgebung: String): String? =
    providers.gradleProperty(property).orNull ?: providers.environmentVariable(umgebung).orNull

val releaseKeystore = wert("tcm.keystore", "TCM_KEYSTORE")

/**
 * Firebase fuer Push (README, "Push"): Gradle-Property `tcm.firebase.<name>`,
 * Umgebung `FIREBASE_<NAME>` oder `firebase.<name>` in lokal.properties.
 * Leer heisst: kein Push, die App laeuft sonst normal. Die App-ID gilt je
 * Paket, deshalb je Variante (`appId.lokal`, `appId.dev`, `appId.prod`).
 */
fun firebase(name: String, umgebung: String): String =
    wert("tcm.firebase.$name", umgebung) ?: lokal.getProperty("firebase.$name") ?: ""

android {
    namespace = "de.tcmuckensturm.app"
    compileSdk = 37
    // Installiert (README); android.builder.sdkDownload=false laedt nichts nach.
    buildToolsVersion = "37.0.0"

    defaultConfig {
        applicationId = "de.tcmuckensturm.app"
        minSdk = 26
        // Google Play verlangt fuer neue Apps und Updates mindestens 36.
        targetSdk = 36
        versionCode = providers.gradleProperty("tcm.versionCode").orNull?.toInt() ?: 1
        versionName = "0.1.0"

        buildConfigField("String", "FIREBASE_PROJECT_ID", firebase("projectId", "FIREBASE_PROJECT_ID").alsBuildConfig())
        buildConfigField("String", "FIREBASE_API_KEY", firebase("apiKey", "FIREBASE_API_KEY").alsBuildConfig())
        buildConfigField("String", "FIREBASE_SENDER_ID", firebase("senderId", "FIREBASE_SENDER_ID").alsBuildConfig())
    }

    flavorDimensions += "umgebung"
    productFlavors {
        create("lokal") {
            dimension = "umgebung"
            buildConfigField("String", "FIREBASE_APP_ID", firebase("appId.lokal", "FIREBASE_APP_ID_LOKAL").alsBuildConfig())
            applicationIdSuffix = ".lokal"
            resValue("string", "app_name", "TCM Lokal")
            buildConfigField("String", "SUPABASE_URL", lokal.getProperty("supabase.url", "").alsBuildConfig())
            buildConfigField("String", "SUPABASE_KEY", lokal.getProperty("supabase.key", "").alsBuildConfig())
            buildConfigField("String", "SITE_URL", "".alsBuildConfig())
            // Nicht tcm: das ist die Expo-App, die im selben Emulator liegen kann.
            buildConfigField("String", "URL_SCHEMA", "tcmlokal".alsBuildConfig())
            manifestPlaceholders["urlSchema"] = "tcmlokal"
        }
        create("dev") {
            dimension = "umgebung"
            buildConfigField("String", "FIREBASE_APP_ID", firebase("appId.dev", "FIREBASE_APP_ID_DEV").alsBuildConfig())
            applicationIdSuffix = ".dev"
            resValue("string", "app_name", "TCM Dev")
            buildConfigField("String", "SUPABASE_URL", DevBackend.SUPABASE_URL.alsBuildConfig())
            buildConfigField("String", "SUPABASE_KEY", DevBackend.SUPABASE_KEY.alsBuildConfig())
            buildConfigField("String", "SITE_URL", DevBackend.SITE_URL.alsBuildConfig())
            buildConfigField("String", "URL_SCHEMA", "tcmdev".alsBuildConfig())
            manifestPlaceholders["urlSchema"] = "tcmdev"
        }
        create("prod") {
            dimension = "umgebung"
            buildConfigField("String", "FIREBASE_APP_ID", firebase("appId.prod", "FIREBASE_APP_ID_PROD").alsBuildConfig())
            resValue("string", "app_name", "TC Muckensturm")
            // TODO: Werte des Prod-Projekts eintragen, sobald es die native App gibt (wie Prod.xcconfig).
            buildConfigField("String", "SUPABASE_URL", (if (prodGegenDev) DevBackend.SUPABASE_URL else "").alsBuildConfig())
            buildConfigField("String", "SUPABASE_KEY", (if (prodGegenDev) DevBackend.SUPABASE_KEY else "").alsBuildConfig())
            buildConfigField(
                "String",
                "SITE_URL",
                (if (prodGegenDev) DevBackend.SITE_URL else "https://app.tennisclub-muckensturm.de").alsBuildConfig(),
            )
            buildConfigField("String", "URL_SCHEMA", "tcm".alsBuildConfig())
            manifestPlaceholders["urlSchema"] = "tcm"
        }
    }

    signingConfigs {
        if (releaseKeystore != null) {
            create("release") {
                storeFile = file(releaseKeystore)
                storePassword = wert("tcm.keystorePasswort", "TCM_KEYSTORE_PASSWORT")
                keyAlias = wert("tcm.keyAlias", "TCM_KEY_ALIAS")
                keyPassword = wert("tcm.keyPasswort", "TCM_KEY_PASSWORT")
            }
        }
    }

    buildTypes {
        // debug signiert mit dem Debug-Keystore des Rechners (~/.android/debug.keystore).
        release {
            // TODO: R8 einschalten, sobald die Regeln fuer kotlinx.serialization/Ktor geprueft sind.
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release")
        }
    }

    bundle {
        // Die App ist deutsch; der Datumswaehler stellt auf Deutsch um, auch auf einem englischen
        // Telefon (OnboardingSchritte.kt). Dafuer muessen die deutschen Texte immer mitkommen.
        language { enableSplit = false }
    }

    buildFeatures {
        compose = true
        buildConfig = true
        resValues = true
    }

    sourceSets {
        getByName("main") {
            // Erzeugt aus packages/ui/src/tokens.ts (pnpm --filter @tcm/ui build:native) - eingebunden, nicht kopiert
            kotlin.directories.add("../../../packages/ui/generated")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }

    testOptions {
        unitTests {
            isIncludeAndroidResources = true
        }
    }

    lint {
        abortOnError = true
        // Versionen pinnt libs.versions.toml bewusst (mindestens zwei Wochen alt), nicht Lint.
        disable += setOf("GradleDependency", "AndroidGradlePluginVersion", "NewerVersionAvailable")
    }
}

androidComponents {
    beforeVariants { variante ->
        val lokal = variante.productFlavors.any { it.second == "lokal" }
        // Lokal gibt es nur als Debug-Build (wie die Konfiguration Lokal in apps/ios).
        if (lokal && variante.buildType == "release") variante.enable = false
        // Die JVM-Tests (JUnit, Robolectric, Roborazzi) laufen einmal, mit lokalDebug -
        // sie haengen an keiner Umgebung, und die Screenshots entstehen so nur einmal.
        variante.hostTests[HostTestBuilder.UNIT_TEST_TYPE]?.enable = lokal && variante.buildType == "debug"
    }
}

roborazzi {
    // captureRoboImage("<name>.png") legt die Bilder hier ab (README, Screenshots).
    outputDir.set(file("../docs"))
}

kotlin {
    jvmToolchain(21)
}

dependencies {
    implementation(project(":kern"))

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.browser)

    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.graphics)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons.core)
    debugImplementation(libs.compose.ui.tooling)

    implementation(platform(libs.supabase.bom))
    implementation(libs.supabase.auth)
    implementation(libs.supabase.postgrest)
    implementation(libs.supabase.realtime)
    implementation(libs.supabase.functions)
    implementation(libs.ktor.client.okhttp)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)

    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)

    testImplementation(libs.junit4)
    testImplementation(libs.robolectric)
    testImplementation(libs.roborazzi)
    testImplementation(libs.roborazzi.compose)
    testImplementation(libs.roborazzi.junit.rule)
    testImplementation(libs.androidx.test.core)
    testImplementation(libs.androidx.test.ext.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.turbine)
    testImplementation(platform(libs.compose.bom))
    testImplementation(libs.compose.ui.test.junit4)
    debugImplementation(libs.compose.ui.test.manifest)
}
