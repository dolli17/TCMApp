#!/bin/bash
# Notfall-Weg ohne GitHub Actions: bringt einen Stand in eine Umgebung.
#
#   ./deploy/web/deploy.sh dev  [ref]   # Default: origin/main
#   ./deploy/web/deploy.sh prod <ref>   # z. B. v1.2.0 oder origin/production
#
# Normalerweise deployt der Workflow "Deploy" bei jedem Merge (CONTRIBUTING.md).
# Dieses Skript baut nur das Web neu - Migrationen und Edge Functions nicht.
#
# Gebaut wird auf dem Server aus dem GitHub-Repo; der Ref muss also gepusht
# sein. Die eigentliche Arbeit macht deploy/web/server-deploy.sh, das auf dem
# Server als /usr/local/bin/tcm-deploy liegt - ausgefuehrt als Benutzer deploy,
# dem die Checkouts gehoeren (sonst verweigert git den Zugriff).
set -euo pipefail

SERVER="${TCM_SERVER:-root@187.124.4.243}"
UMGEBUNG="${1:-}"

case "$UMGEBUNG" in
  dev)  REF="${2:-origin/main}" ;;
  prod)
    REF="${2:?Für prod einen Ref angeben, z. B. v1.2.0}"
    read -r -p "Wirklich $REF nach PROD? Zum Bestätigen 'prod' eintippen: " OK
    [ "$OK" = prod ] || { echo "Abgebrochen."; exit 1; }
    ;;
  *) echo "Aufruf: $0 dev|prod [ref]" >&2; exit 2 ;;
esac

git fetch -q --tags origin
SHA="$(git rev-parse --verify "$REF^{commit}")"
echo "Deploye $REF ($(git log -1 --format='%h %s' "$SHA")) nach $UMGEBUNG"

ssh "$SERVER" sudo -u deploy /usr/local/bin/tcm-deploy "$UMGEBUNG" "$SHA"
