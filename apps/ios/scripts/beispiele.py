# Macht aus den Aufzeichnungen vom lokalen Stack (17.11.2026) die Beispielantworten der Tests:
# Testmuell (ZZ…, E2E) raus, lange Listen gekuerzt, leere Listen mit Zeilen in derselben Form gefuellt.
import json, sys, copy
S, Z = sys.argv[1], sys.argv[2]
L = lambda n: json.load(open(f'{S}/antworten/{n}.json'))
def W(name, d):
    json.dump(d, open(f'{Z}/{name}.json', 'w'), ensure_ascii=False, indent=1); open(f'{Z}/{name}.json','a').write('\n')
ICH = "e2e00000-0000-4000-8000-000000000002"
W('ich', L('mitglied-ich'))
W('ich-admin', L('admin-ich'))
W('mein_zugang', L('mitglied-mein_zugang'))
p = L('mitglied-mein_profil'); p[0]['city'] = 'Stuttgart'; p[0]['mobile'] = '0170 1234567'; W('mein_profil', p)
W('my_charges', [
 {"id":"10954929-b364-40bb-a663-3fbd4ca70beb","member_name":"Noah Brandt","kind":"event","period_label":None,"amount_cents":1250,"description":"Sommerfest am 07.12.2026","status":"open","due_date":None,"is_for_other":False},
 {"id":"561d8983-d20a-4385-ac3a-cbbaa23185f9","member_name":"Noah Brandt","kind":"fee","period_label":"2026","amount_cents":18000,"description":"Jahresbeitrag Erwachsene","status":"notified","due_date":"2026-12-01","is_for_other":False},
 {"id":"efc15867-3376-4248-80fc-81f14f7b9522","member_name":"Mia Brandt","kind":"fee","period_label":"2026","amount_cents":6000,"description":"Jahresbeitrag Jugend","status":"paid","due_date":"2026-03-01","is_for_other":True}])
W('mein_mandat', L('admin-mein_mandat'))
ma = [a for a in L('mitglied-member_attributes') if 'e2e' not in a['code']]
for a in ma:
    if a['code'] == 'foto': a['set_at'] = '2026-11-10T17:00:52.233164+00:00'
    if a['code'] == 'booking_mail': a['option_value'], a['option_label'], a['set_at'] = 'wichtige', 'Nur Wichtiges', '2026-11-10T17:00:52.233164+00:00'
W('member_attributes', ma)
courts = L('mitglied-courts_aktiv'); W('courts_aktiv', courts)
c = [x['id'] for x in courts]
W('booking_settings', L('mitglied-booking_settings'))
W('booking_types_aktiv', L('mitglied-booking_types_aktiv'))
W('booking_types_aktiv-blocking', L('admin-booking_types_blocking'))
W('my_booking_quota', [{"used": 1, "allowed": 3}])
W('member_directory', L('mitglied-member_directory')[:14])
serie = L('mitglied-day_schedule')[0]
def beleg(**k):
    b = copy.deepcopy(serie); b.update(dict(kind='booking', type_code='einzel', type_name='Einzel', title=None, series_id=None, is_own=False)); b.update(k); return b
W('day_schedule', [
 serie,
 beleg(booking_id="b0000000-0000-4000-8000-000000000001", court_id=c[0], starts_at="2026-11-17T09:00:00+00:00", ends_at="2026-11-17T10:00:00+00:00",
       owner_name="Noah Brandt", owner_member_id=ICH, is_own=True, players=["Noah Brandt","Erika Sommer"], player_member_ids=[ICH,"25c31169-2299-a28e-c06a-d4d6555fdcd6"]),
 beleg(booking_id="b0000000-0000-4000-8000-000000000002", court_id=c[1], starts_at="2026-11-17T15:00:00+00:00", ends_at="2026-11-17T16:00:00+00:00",
       type_code='doppel', type_name='Doppel', owner_name="Julia Stein", owner_member_id="4186ddd9-ab11-969c-b195-648f14051b8e",
       players=["Julia Stein","Jan Bauer"], player_member_ids=["4186ddd9-ab11-969c-b195-648f14051b8e","bfdfdb16-4bc5-71bd-1d32-7160ad22eb8e"],
       partner_wanted=True, frei=2, partner_lk_von=10.0, partner_lk_bis=15.0, partner_fuer="alle"),
 beleg(booking_id="b0000000-0000-4000-8000-000000000003", court_id=c[2], starts_at="2026-11-17T12:00:00+00:00", ends_at="2026-11-17T14:00:00+00:00",
       kind='blocking', type_code='platzpflege', type_name='Platzpflege', title='Linien erneuern', owner_name=None, owner_member_id=None, is_own=None),
 beleg(booking_id="b0000000-0000-4000-8000-000000000004", court_id=c[3], starts_at="2026-11-17T18:00:00+00:00", ends_at="2026-11-17T19:00:00+00:00",
       owner_name="Uwe Engel", owner_member_id="1b8c965f-bae7-5029-0000-000000000000", players=["Uwe Engel"], player_member_ids=["1b8c965f-bae7-5029-0000-000000000000"],
       guest_names=["Gast"], bin_dabei=True),
])
W('my_bookings', [
 {"booking_id":"b0000000-0000-4000-8000-000000000011","starts_at":"2026-11-18T16:00:00+00:00","ends_at":"2026-11-18T17:00:00+00:00","court_name":"Platz 3","kind":"booking","type_code":"einzel","type_name":"Einzel","title":None,"owner_name":"Noah Brandt","bin_bucher":True,"players":["Noah Brandt","Erika Sommer"]},
 {"booking_id":"b0000000-0000-4000-8000-000000000012","starts_at":"2026-11-20T09:00:00+00:00","ends_at":"2026-11-20T10:00:00+00:00","court_name":"Platz 5","kind":"booking","type_code":"doppel","type_name":"Doppel","title":None,"owner_name":"Julia Stein","bin_bucher":False,"players":["Julia Stein","Noah Brandt","Jan Bauer",None]}])
W('open_matches', [
 {"booking_id":"b0000000-0000-4000-8000-000000000021","starts_at":"2026-11-18T17:00:00+00:00","ends_at":"2026-11-18T18:00:00+00:00","court_name":"Platz 2","type_code":"doppel","type_name":"Doppel","owner_member_id":"4186ddd9-ab11-969c-b195-648f14051b8e","owner_name":"Julia Stein","players":["Julia Stein","Jan Bauer"],"frei":2,"bin_dabei":False,"lk_von":10.0,"lk_bis":15.0,"fuer":"alle"},
 {"booking_id":"b0000000-0000-4000-8000-000000000011","starts_at":"2026-11-18T16:00:00+00:00","ends_at":"2026-11-18T17:00:00+00:00","court_name":"Platz 3","type_code":"einzel","type_name":"Einzel","owner_member_id":ICH,"owner_name":"Noah Brandt","players":["Noah Brandt"],"frei":1,"bin_dabei":True,"lk_von":None,"lk_bis":None,"fuer":None}])
dp = [d for d in L('mitglied-my_drink_purchases')][:4]
dp[0].update(item_name="Apfelschorle", quantity=2, unit_price_cents=250, total_cents=500, voided_at=None, created_at="2026-11-17T10:00:00+00:00")
dp[1].update(voided_at="2026-11-16T15:59:53.75274+00:00", created_at="2026-11-16T15:59:53.397477+00:00")
dp[2].update(voided_at=None, created_at="2026-11-12T17:10:00+00:00"); dp[3].update(voided_at=None, created_at="2026-11-03T17:10:00+00:00", source="kiosk")
W('my_drink_purchases', dp)
W('drink_menu', L('mitglied-drink_menu'))
W('drink_void_window_minutes', 15)
W('my_work_duty', L('mitglied-my_work_duty'))
ev = L('mitglied-events_fuer_mitglied')
fest = copy.deepcopy(next(e for e in ev if e['meine_forderung_cents']))
def E(**k):
    e = copy.deepcopy(fest); e.update(k); return e
W('events_fuer_mitglied', [
 E(id="e0000000-0000-4000-8000-000000000001", title="Sommerfest", description="Mit Grill und Musik. Salate bitte mitbringen.", meine_begleitpersonen=1, meine_bemerkung="Bringe Kartoffelsalat mit", meine_forderung_status="open"),
 E(id="e0000000-0000-4000-8000-000000000002", kind="arbeitsdienst", title="Plätze winterfest machen", description=None, location="Anlage", starts_at="2026-11-28T08:00:00+00:00", ends_at="2026-11-28T12:00:00+00:00",
   max_participants=None, fee_cents=None, work_hours=3.0, personen=6, mein_status=None, meine_begleitpersonen=None, meine_forderung_cents=None, registration_deadline=None, companions_allowed=False),
 E(id="e0000000-0000-4000-8000-000000000003", title="Weihnachtsfeier", starts_at="2026-12-18T18:00:00+00:00", ends_at=None, max_participants=40, fee_cents=None, personen=40, warteliste=3,
   mein_status="waitlisted", meine_begleitpersonen=0, meine_forderung_cents=None, registration_deadline="2026-12-10T22:59:00+00:00"),
 E(id="e0000000-0000-4000-8000-000000000004", title="Mitgliederversammlung", kind="versammlung", starts_at="2027-01-15T18:00:00+00:00", ends_at=None, registration_enabled=False, max_participants=None, fee_cents=None,
   personen=0, mein_status=None, meine_begleitpersonen=None, meine_forderung_cents=None, registration_deadline=None),
 E(id="e0000000-0000-4000-8000-000000000005", title="Herbstfest", starts_at="2026-11-07T17:00:00+00:00", ends_at="2026-11-07T22:00:00+00:00", fee_cents=None, mein_status="attended", meine_forderung_cents=None, registration_deadline=None),
 E(id="e0000000-0000-4000-8000-000000000006", title="Schleifchenturnier", status="cancelled", starts_at="2026-11-29T09:00:00+00:00", ends_at=None, fee_cents=None, mein_status=None, personen=0, meine_forderung_cents=None, registration_deadline=None),
])
W('event_mein_wartelistenplatz', 2)
n = L('admin-my_notifications')
N = lambda i, **k: dict({"id": f"a0000000-0000-4000-8000-00000000000{i}", "read_at": None, "event_id": None}, **k)
W('my_notifications', [
 N(1, kind="player_joined", title="Jemand spielt mit", body="Julia Stein hat sich für 18.11.2026 um 17:00 Uhr auf Platz 3 eingetragen.", created_at="2026-11-17T08:03:09.020013+00:00"),
 N(2, kind="event_published", title="Neu im Verein: Sommerfest", body="Fest am 07.12.2026, 19:00 Uhr, Clubhaus. Anmeldung bis 02.12.2026.", created_at="2026-11-16T16:04:13.618845+00:00", event_id="e0000000-0000-4000-8000-000000000001"),
 N(3, kind="team_invitation", title="Einladung in die Mannschaft Herren", body="Julia Stein lädt dich in die Mannschaft Herren ein.", created_at="2026-11-15T10:00:00+00:00", read_at="2026-11-15T12:00:00+00:00"),
 N(4, kind="booking_cancelled", title="Buchung storniert", body="Deine Buchung am 12.11.2026 um 18:00 Uhr auf Platz 1 wurde storniert: Platzpflege.", created_at="2026-11-11T09:00:00+00:00", read_at="2026-11-11T12:00:00+00:00")])
W('my_unread_notification_count', 2)
def onb(k):
    o = L(f'{k}-my_onboarding'); o['mandat']['text'] = o['mandat']['text'][:400]
    for m in o['merkmale']: m['description'] = (m['description'] or '')[:160] or None
    return o
W('my_onboarding', onb('kind'))
W('my_onboarding-erwachsen', onb('neu'))
fertig = onb('mitglied'); W('my_onboarding-fertig', fertig)
mm = L('mitglied-meine_mannschaft'); mm['kader'][1]['telefon'] = '0171 2345678'; W('meine_mannschaft', mm)
W('meine_mannschaft_einladungen', L('admin-meine_mannschaft_einladungen'))
W('mannschaft_kandidaten', L('mitglied-mannschaft_kandidaten')[:6])
co = [x for x in L('admin-court_overview') if not x['name'].startswith('ZZ')]
co.append({"id":"ac99a393-7b63-47d6-8799-4b390ec16b34","name":"Platz 9","short_name":"P9","subline":"Hartplatz","sort_position":8,"active":False,"offene_buchungen":0})
W('court_overview', co)
so = L('admin-series_overview'); so.append(dict(so[0], id="e114751e-2ebd-42a6-b5a4-544e410805c1", court_name="Platz 1", type_name="Verbandsspiel", title="Herren 30", weekday=6, start_time="09:00:00", end_time="13:00:00", kuenftige=4)); W('series_overview', so)
W('preview_series', [
 {"starts_at":"2026-11-24T17:30:00+00:00","ends_at":"2026-11-24T19:00:00+00:00","conflict_booking_id":None,"conflict_member_name":None,"conflict_kind":None},
 {"starts_at":"2026-12-01T17:30:00+00:00","ends_at":"2026-12-01T19:00:00+00:00","conflict_booking_id":"b0000000-0000-4000-8000-000000000031","conflict_member_name":"Julia Stein","conflict_kind":"booking"}])
t = json.load(open(f'{S}/antworten/_token_mitglied.json'))
import base64
b = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip('=')
t['access_token'] = b({"alg":"HS256","typ":"JWT"}) + '.' + b({"sub": t['user']['id'], "role":"authenticated", "exp": 4102444800}) + '.attrappe'
t['refresh_token'] = 'attrappe-refresh'; t['expires_at'] = 4102444800
W('auth-token', t)
