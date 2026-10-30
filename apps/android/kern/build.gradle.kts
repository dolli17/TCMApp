// Rechenlogik aus @tcm/core als reines Kotlin - ohne Android, testbar auf der JVM.
// Gegen die Golden Files in packages/core/golden geprueft (README dort).
plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.serialization)
}

kotlin {
    jvmToolchain(21)
}

sourceSets {
    // Eingebunden, nicht kopiert: aendert sich eine Golden-Datei, schlaegt der Test hier an.
    test {
        resources.srcDir("../../../packages/core/golden")
    }
}

dependencies {
    // Modelle wie PostgresFehler sind @Serializable; die App liest damit Antworten der RPCs.
    api(libs.kotlinx.serialization.json)

    testImplementation(platform(libs.junit.bom))
    testImplementation(libs.junit.jupiter)
    testRuntimeOnly(libs.junit.platform.launcher)
}

tasks.test {
    useJUnitPlatform()
}
