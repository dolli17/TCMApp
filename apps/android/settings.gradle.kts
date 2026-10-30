// Android-App des TC Muckensturm (Kotlin, Jetpack Compose). Aufbau: README.md.

pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "TCMuckensturm"

// :app      die Compose-App
// :kern     Rechenlogik aus @tcm/core, reines Kotlin, gegen die Golden Files geprueft
// :widgets  folgt mit der Widget-Spur (Glance)
include(":app", ":kern")
