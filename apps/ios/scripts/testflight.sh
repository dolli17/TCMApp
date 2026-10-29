#!/usr/bin/env bash
# Baut die App fuer TestFlight und laedt sie zu App Store Connect hoch.
#
#   scripts/testflight.sh <buildnummer> [version]
#
# Gebaut wird die Konfiguration Prod (Bundle de.tcmuckensturm.app, dieselbe
# App wie die Expo-Builds bis 16), aber gegen das Dev-Projekt - genau wie die
# Expo-Builds (apps/mobile/eas.json). Prod.xcconfig hat noch keine Werte; die
# Dev-Werte kommen hier nur fuer diesen Lauf dazu (Konfiguration/TestFlight.xcconfig).
#
# Signiert wird automatisch (-allowProvisioningUpdates) mit dem Apple-Konto,
# das in Xcode unter Settings > Accounts angemeldet ist: Xcode legt
# Zertifikat und Profile an und meldet App Group, Associated Domains und Push
# an. Mit dem API-Schluessel allein geht das nicht (App Groups gibt es in der
# API nicht). Hochgeladen wird mit dem API-Schluessel von App Store Connect;
# er liegt nicht im Repo, sondern wird ueber die Umgebung uebergeben:
#
#   ASC_KEY_PATH   Pfad zur AuthKey_<id>.p8
#   ASC_KEY_ID     Schluessel-ID
#   ASC_ISSUER_ID  Issuer-ID
#
# Die Buildnummer muss hoeher sein als jede bisher hochgeladene (Expo: bis 16).
set -euo pipefail

build="${1:?Buildnummer fehlt, z. B. scripts/testflight.sh 17}"
version="${2:-}"
: "${ASC_KEY_PATH:?ASC_KEY_PATH fehlt}" "${ASC_KEY_ID:?ASC_KEY_ID fehlt}" "${ASC_ISSUER_ID:?ASC_ISSUER_ID fehlt}"

hier="$(cd "$(dirname "$0")/.." && pwd)"
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
aus="$hier/build/testflight"
rm -rf "$aus"
mkdir -p "$aus"

cd "$hier"
xcodegen generate --quiet

auth=(
  -authenticationKeyPath "$ASC_KEY_PATH"
  -authenticationKeyID "$ASC_KEY_ID"
  -authenticationKeyIssuerID "$ASC_ISSUER_ID"
)

versionen=(CURRENT_PROJECT_VERSION="$build")
[[ -n "$version" ]] && versionen+=(MARKETING_VERSION="$version")

xcodebuild archive \
  -project TCMuckensturm.xcodeproj \
  -scheme TCMuckensturm \
  -configuration Prod \
  -destination "generic/platform=iOS" \
  -archivePath "$aus/TCMuckensturm.xcarchive" \
  -xcconfig Konfiguration/TestFlight.xcconfig \
  "${versionen[@]}" \
  -allowProvisioningUpdates

cat > "$aus/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>signingStyle</key><string>automatic</string>
  <key>teamID</key><string>93Z2KKGMV7</string>
  <key>manageAppVersionAndBuildNumber</key><false/>
  <key>uploadSymbols</key><true/>
</dict>
</plist>
PLIST

xcodebuild -exportArchive \
  -archivePath "$aus/TCMuckensturm.xcarchive" \
  -exportOptionsPlist "$aus/ExportOptions.plist" \
  -exportPath "$aus/export" \
  -allowProvisioningUpdates \
  "${auth[@]}"

echo "Build $build ist hochgeladen. App Store Connect braucht einige Minuten fuer die Verarbeitung."
