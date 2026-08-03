import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Start() {
  const angemeldet = await getCurrentMember();

  if (!angemeldet) redirect("/login");
  // Kiosk-Geraete haben keinen Mitgliedsdatensatz und landen direkt an der Theke.
  if (!angemeldet.member) redirect("/kiosk");
  redirect("/plan");
}
