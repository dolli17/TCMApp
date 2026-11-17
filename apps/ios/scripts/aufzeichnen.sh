#!/bin/bash
# Liest nur (RPCs ohne Schreibwirkung) vom lokalen Stack.
S="$1"; KEY="$2"; PW="$3"
tok() { curl -s -X POST "http://127.0.0.1:54321/auth/v1/token?grant_type=password" -H "apikey: $KEY" -H "Content-Type: application/json" -d "{\"email\":\"$1\",\"password\":\"$PW\"}" | python3 -c "import json,sys; print(json.load(sys.stdin)['access_token'])"; }
rpc() { B="$3"; [ -z "$B" ] && B="{}"
  curl -s -X POST "http://127.0.0.1:54321/rest/v1/rpc/$2" -H "apikey: $KEY" -H "Authorization: Bearer $T" -H "Content-Type: application/json" -d "$B" > "$S/antworten/$1-$2.json";  }
for konto in mitglied admin neu kind; do
  T=$(tok $konto@tcm.local) || continue
  HEUTE=$(TZ=Europe/Berlin date +%F)
  for r in ich mein_zugang mein_profil my_charges mein_mandat my_bookings open_matches booking_settings courts_aktiv my_drink_purchases my_work_duty events_fuer_mitglied my_unread_notification_count my_booking_quota drink_menu drink_void_window_minutes my_onboarding meine_mannschaft meine_mannschaft_einladungen mannschaft_kandidaten court_overview series_overview; do rpc $konto $r; done
  rpc $konto day_schedule "{\"p_date\":\"$HEUTE\"}"
  rpc $konto booking_types_aktiv '{"p_applies_to":"booking"}'
  rpc $konto my_notifications '{"p_limit":50}'
  rpc $konto member_directory '{"p_query":"an"}'
  MID=$(python3 -c "import json; d=json.load(open('$S/antworten/$konto-ich.json')); print(d[0].get('member_id') or '')")
  [ -n "$MID" ] && rpc $konto member_attributes "{\"p_member_id\":\"$MID\"}"
done
