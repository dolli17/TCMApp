#!/usr/bin/env bash
# Legt Konfiguration/Lokal.geheim.xcconfig fuer den lokalen Supabase-Stack an.
#
# Quelle ist apps/mobile/.env (EXPO_PUBLIC_SUPABASE_*). Zeigt die dort auf die
# Cloud - so ist es im Haupt-Checkout eingerichtet -, kommen die Werte aus
# apps/web/.env.local (NEXT_PUBLIC_SUPABASE_*). Angenommen wird nur eine
# Adresse auf 127.0.0.1/localhost: die Konfiguration "Lokal" darf nie gegen Dev
# oder Prod laufen. Die Zieldatei ist gitignored.
set -euo pipefail

hier="$(cd "$(dirname "$0")/.." && pwd)"
apps="$hier/.."
ziel="$hier/Konfiguration/Lokal.geheim.xcconfig"

wert() { [[ -f "$1" ]] && grep -E "^$2=" "$1" | tail -n1 | cut -d= -f2- | tr -d '"' || true; }
lokal() { [[ "$1" =~ ^http://(127\.0\.0\.1|localhost)(:[0-9]+)?/?$ ]]; }

url="$(wert "$apps/mobile/.env" EXPO_PUBLIC_SUPABASE_URL)"
key="$(wert "$apps/mobile/.env" EXPO_PUBLIC_SUPABASE_ANON_KEY)"
quelle="apps/mobile/.env"

if ! lokal "$url"; then
  url="$(wert "$apps/web/.env.local" NEXT_PUBLIC_SUPABASE_URL)"
  key="$(wert "$apps/web/.env.local" NEXT_PUBLIC_SUPABASE_ANON_KEY)"
  quelle="apps/web/.env.local"
fi

if ! lokal "$url" || [[ -z "$key" ]]; then
  echo "Keine lokale Supabase-Adresse in apps/mobile/.env oder apps/web/.env.local gefunden." >&2
  echo "Env-Dateien mit scripts/worktree-einrichten.sh kopieren oder die Datei aus der .example anlegen." >&2
  exit 1
fi

{
  echo "// Erzeugt von scripts/lokal-konfigurieren.sh aus $quelle - nicht einchecken."
  echo "SUPABASE_URL = ${url/:\/\//:/\$()/}"
  echo "SUPABASE_KEY = $key"
} > "$ziel"
echo "Geschrieben: $ziel (aus $quelle)"
