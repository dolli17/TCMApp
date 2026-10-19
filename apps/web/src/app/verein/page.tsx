import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { alsVereinReiter, VEREIN_REITER_COOKIE } from "@/lib/verein";

export const dynamic = "force-dynamic";

/** /verein: zum zuletzt gewählten Reiter, sonst zu den Getränken. */
export default async function VereinSeite() {
  const reiter = alsVereinReiter((await cookies()).get(VEREIN_REITER_COOKIE)?.value);
  redirect(`/verein/${reiter}`);
}
