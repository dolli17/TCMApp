#!/usr/bin/env node
/** Fälle für den Bash-Wächter. Aufruf: node scripts/claude/bash-waechter.test.mjs */
import assert from "node:assert/strict";
import process from "node:process";
import { pruefe } from "./bash-waechter.mjs";

const stufe = (befehl) => pruefe(befehl)?.stufe ?? "frei";

const FAELLE = [
  // Verboten
  ["pnpm exec supabase db push", "verboten"],
  ["cd supabase && supabase db push --dry-run", "verboten"],
  ["sh -c 'supabase functions deploy member-login'", "verboten"],
  ["supabase link --project-ref abc", "verboten"],
  ["supabase secrets set FOO=bar", "verboten"],
  ["supabase db reset --linked", "verboten"],
  ["git push origin main", "verboten"],
  ["git push origin HEAD:production", "verboten"],
  ["git push --force origin main", "verboten"],
  ["git push origin v1.2.0", "verboten"],
  ["git push --tags", "verboten"],
  ["git tag v1.0.0", "verboten"],
  ["git tag -a v1.0.0 -m x", "verboten"],
  ["ssh deploy@example.org tcm-deploy prod abc", "verboten"],
  ["scp datei root@example.org:/tmp", "verboten"],
  ["./deploy/web/deploy.sh prod v1.0.0", "verboten"],
  ["gh secret set SUPABASE_ACCESS_TOKEN", "verboten"],
  ["gh release create v1.0.0", "verboten"],
  ["gh repo edit --visibility private", "verboten"],
  // Nachfragen
  ["gh pr merge 12 --squash", "nachfragen"],
  ["gh run rerun 123 --failed", "nachfragen"],
  ["gh workflow run Deploy", "nachfragen"],
  ["gh api -X DELETE repos/a/b/rulesets/1", "nachfragen"],
  ["gh api repos/a/b/issues -f title=x", "nachfragen"],
  ["pnpm exec supabase migration list --linked", "nachfragen"],
  ["pnpm exec supabase functions list --project-ref abc", "nachfragen"],
  ["git push --force-with-lease origin feature/x", "nachfragen"],
  // Frei
  ["pnpm verify:ci", "frei"],
  ["pnpm db:reset", "frei"],
  ["pnpm exec supabase status -o env", "frei"],
  ["pnpm exec supabase start -x studio", "frei"],
  ["pnpm exec supabase migration new thema", "frei"],
  ["git push -u origin feature/mainmenue", "frei"],
  ["git push origin fix/production-hinweis", "frei"],
  ["git tag", "frei"],
  ["git tag -l 'v*'", "frei"],
  ["git log origin/main..HEAD", "frei"],
  ["gh pr create --base main --title x", "frei"],
  ["gh api repos/a/b/rulesets", "frei"],
  ["gh release list", "frei"],
  // Zitierter Text ist kein Aufruf
  ["grep -rn 'supabase db push' docs", "frei"],
  ['git commit -m "Doku: supabase db push nur im Workflow"', "frei"],
  ["gh pr create --title x --body \"$(cat <<'EOF'\nKein git push origin main mehr.\nEOF\n)\"", "frei"],
  // ... außer er geht an eine Shell
  ['bash -c "git push origin main"', "verboten"],
  ["eval 'gh pr merge 3'", "nachfragen"],
];

let fehler = 0;
for (const [befehl, soll] of FAELLE) {
  const ist = stufe(befehl);
  if (ist !== soll) {
    fehler++;
    process.stderr.write(`FEHLER  ${befehl}\n        soll ${soll}, ist ${ist}\n`);
  }
}
assert.equal(fehler, 0, `${fehler} von ${FAELLE.length} Fällen falsch`);
process.stdout.write(`${FAELLE.length} Fälle bestanden\n`);
