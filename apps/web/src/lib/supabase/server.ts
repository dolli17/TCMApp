/**
 * Supabase auf dem Server.
 *
 * Nutzt next/headers und darf deshalb nur aus Server-Komponenten, Route
 * Handlern und Server Actions importiert werden - nie aus einer Datei mit
 * "use client".
 *
 * Auch hier ausschliesslich der oeffentliche Schluessel: was ein Benutzer
 * sehen darf, entscheidet RLS, nicht die Server-Komponente.
 */

import { createServerClient } from "@supabase/ssr";
import type { Database } from "@tcm/core";
import { cookies } from "next/headers";

export async function createServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_ANON_KEY fehlen. " +
        ".env aus .env.example anlegen.",
    );
  }

  const store = await cookies();

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) {
            store.set(name, value, options);
          }
        } catch {
          // In Server-Komponenten ist Schreiben nicht erlaubt. Die Middleware
          // erneuert die Sitzung, deshalb ist das hier folgenlos.
        }
      },
    },
  });
}

/**
 * Angemeldetes Mitglied samt Rollen.
 *
 * member ist null, wenn der Account zu keinem Mitglied gehoert - das trifft
 * auf die Kiosk-Geraete zu.
 */
export async function getCurrentMember() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: member } = await supabase
    .from("members")
    .select("id, first_name, last_name, email, billing_payer_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!member) return { user, member: null, roles: [] as string[] };

  const { data: roles } = await supabase
    .from("member_roles")
    .select("role")
    .eq("member_id", member.id);

  return {
    user,
    member,
    roles: (roles ?? []).map((r) => r.role as string),
  };
}

// Rollen-Helfer der Bequemlichkeit halber mit durchreichen: Server-Komponenten
// brauchen fast immer beides.
export { hasRole, isAdmin } from "./rollen";
