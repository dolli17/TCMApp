import { CHARGE_KIND_LABEL, CHARGE_KIND_TON, sortChargeKinds } from "@tcm/core";

/**
 * Die Art einer Forderung als kleine Marke: Beitrag blau, Getränke gold, der
 * Rest grau. Damit ist in jeder Liste auf einen Blick zu sehen, was eine
 * Forderung oder Lastschrift eigentlich einzieht.
 */
export function ArtMarke({ art }: { art: string }) {
  const [k] = sortChargeKinds([art]);
  if (!k) return null;
  return <span className={`marke-klein ${CHARGE_KIND_TON[k]}`}>{CHARGE_KIND_LABEL[k]}</span>;
}

/** Mehrere Arten nebeneinander, in Vereinsreihenfolge. */
export function ArtMarken({ arten }: { arten: readonly string[] | null | undefined }) {
  const sortiert = sortChargeKinds(arten);
  if (sortiert.length === 0) return null;
  return (
    <span className="art-marken">
      {sortiert.map((k) => (
        <ArtMarke key={k} art={k} />
      ))}
    </span>
  );
}
