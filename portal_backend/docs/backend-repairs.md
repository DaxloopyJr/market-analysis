# Marekebisho ya backend ya 20 Oktoba 2026

Marekebisho yanahusu audit integration, notifications, user/role scope, workflow actor authorization na reporting frequencies. Dashboard/Search na implementation za submissions, approval-circle tables na portal settings hazijabadilishwa.

## Accounts na permissions

IA anaruhusiwa kugawa roles active za institution zilizotajwa wazi: IA, IDO, IHOD, AO na IM. Role yenye permission ya ministry hairuhusiwi. Read user, update, unlock na reset link hukagua institution ya target. Account yenye role ya ministry haihaririwi kupitia institution permission.

Token ya account inactive inakataliwa hata kama ilitolewa kabla ya deactivation. Roles na delegations hukagua effective_from, effective_to na hali ya role. Effective_to inahesabiwa hadi mwisho wa siku yake.

## Audit na transactions

Auth na administration hutuma AuditEventOccurred kupitia RecordsAuditChanges badala ya AuditService::log ambayo haipo. Actor ni authenticated user, si target inayobadilishwa. Public recovery actions zisizo na authenticated actor zinarekodiwa kama system; target user ID hubaki entityId.

AtomicAdministrationWrites huweka database mutations za controllers hizo kwenye transaction. Response ya kosa hurudisha mabadiliko nyuma; failed attempts za login/reset huhifadhiwa hata response ikiwa 422. Audit failure hurudisha database mutations nyuma. Email/SMS ni side effects za nje ambazo transaction ya database haiwezi kuzirudisha nyuma; delivery infrastructure haijabadilishwa katika scope hii.

## Workflow

Assignee maalumu, role, active account na institution/department scope vyote hukaguliwa. Role pekee haiwezi kuruka assigned_user_id. Institution circle hutumia IHOD badala ya HoD. Uhakiki kamili wa lifecycle utahitaji implementation ya submissions ambayo imeachwa nje ya scope.

## Reporting periods

Annual na quarterly payloads za zamani zinaendelea kufanya kazi. Frequencies mpya hutumia annual parent na periodNumber:

```json
{
  "institutionId": 4,
  "periodType": "monthly",
  "parentId": 1,
  "periodNumber": 2,
  "deadline": "2026-09-15"
}
```

Endpoint: `POST /api/v1/reporting-periods`. Parent ID ni mfano; lazima iwe annual ya institution husika iliyo open.

| periodType | Field | Kiwango |
|---|---|---|
| quarterly | quarter | 1–4 |
| monthly | periodNumber | 1–12 |
| semiannual | periodNumber | 1–2 |
| weekly | periodNumber | 1–53 |
| daily | periodNumber | 1–365/366 |

Namba inahesabiwa kuanzia startDate ya annual parent. Kwa FY inayoanza Julai, monthly 2 ni Agosti. Weekly hutumia mafungu ya siku saba kuanzia mwanzo wa reporting year, si ISO week; wiki ya mwisho inaweza kuwa fupi. Dates huhesabiwa na backend; huwezi kutuma startDate/endDate kwa child period. Deadline haitangulii mwisho wa kipindi. Namba iliyo nje ya mwaka, parent ya institution nyingine au parent iliyofungwa hukataliwa.

Migration mpya huongeza period_number na kupanua period_type bila kufuta data. Rollback inakataliwa kama periods za frequencies mpya tayari zipo.
