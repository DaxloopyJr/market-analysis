# Audit — ISP-28

## Muundo

`AuditEventData` hubeba taarifa kwenda `AuditEventOccurred`, kisha listener ya
`RecordAuditEvent` huiita `AuditService`. Service huandika rekodi moja. Listener
haina queue ili iwe sehemu ya transaction ya caller. Middleware huandaa request ID
na IP kabla ya middleware za authentication; haiandiki audit kwa kila request.

## API ya kusoma

- `GET /api/v1/audit-events`: list yenye pagination.
- `GET /api/v1/audit-events/{id}`: rekodi moja; isiyopatikana hurudisha 404.
- Hakuna endpoints za create, update au delete za audit.
- Filters: `eventType`, `actorType`, `userId`, `entityType`, `entityId`, `requestId`,
  `startDate`, `endDate`, `perPage`, `page`.
- Tarehe ni `YYYY-MM-DD`, katika timezone ya application; mwisho unajumuisha siku
  nzima. Default ya perPage ni 20, maximum 100. Mpangilio ni created_at kisha id,
  zote descending. Response hutumia camelCase na pagination metadata ya Laravel.

## Authorization na utegemezi wa BE1

Routes zina `auth:sanctum` na `can:audit.readAll`. Gate `audit.readAll` haijapewa
ruhusa ya kudumu: bila ufafanuzi wake, authenticated user hupata 403; guest hupata
401. Hakuna is_admin iliyoongezwa, role table ya kudhaniwa, au bypass ya production.
BE1 ataunganisha Gate hii na assignments halali za admin katika
user_role → role → role_permission → permission. Gate hii inaruhusu logs zote;
haitolewi kwa IA mwenye scope ya taasisi pekee. Institution-scoped access bado
inahitaji schema na filter yake kabla ya kuwezeshwa.

IDs za user na audit kwa sasa ni integer. Mabadiliko ya kwenda UUID ya ERD
yahitaji uratibu wa foreign keys na DTO pamoja na BE1.

## Matendo yanayorekodiwa

`RecordAuthenticationAudit` husikiliza Laravel `Login`, `Failed` na `Logout`.
Auth implementation lazima itoe events hizo; token issuance ya custom haitoi
events hizi moja kwa moja. Credentials hazihifadhiwi. Failed login huhifadhi
actor asiyejulikana na, ikipatikana, akaunti iliyolengwa kama entity, si actor.

Create/edit/submit/review/return/approve/publish/configure huunganishwa kwenye
service ya kila module baada ya action kufanikiwa, ndani ya transaction ileile:

```php
DB::transaction(function () use ($actorId, $requestId, $ipAddress) {
    // Business action hufanyika hapa; rekodi halisi ndiyo hutumika kama entity.
    AuditEventOccurred::dispatch(new AuditEventData(
        eventType: 'configurationChanged',
        userId: $actorId,
        actorType: 'user',
        ipAddress: $ipAddress,
        requestId: $requestId,
        newValues: ['status' => 'active'],
    ));
});
```

Mfano huu unaonyesha muunganiko pekee. Module husambaza entityType/entityId na
values sahihi. HTTP context inachukuliwa kutoka request attributes
`auditRequestId` na `auditIpAddress`; actor hutokana na authentication, si input.
Jobs zinaweza kutoa actorType `system` na userId null. Usidispatch event na kuita
service moja kwa moja kwa action ileile, kwa sababu itaunda duplicates.
Hakuna observer wa jumla unaodai kuwa kila database write ni business action.

## Ulinzi na matunzo

- Old/new values ziwe arrays za fields zilizochaguliwa. Service huondoa majina
  ya credentials yanayojulikana, hata kwenye nested arrays. Huu si uchujaji wa
  secrets zote kwenye free text; reason, exception messages na JSON strings
  zisibebe credentials au raw request bodies.
- Model huzuia update/delete. Migration ya PostgreSQL ina trigger inayokataa
  UPDATE, DELETE na TRUNCATE, hata bulk SQL. SQLite tests haziendeshi trigger hii.
- Migration hiyo haijaendeshwa moja kwa moja kwenye database ya development.
  Deployment hufanya migrations baada ya review na backup inayofaa.
- Application database role isiwe superuser/table owner, na ipewe SELECT/INSERT
  tu kwenye audit_events pamoja na sequence privileges zinazohitajika. Migration
  role iwe tofauti. Trigger si ulinzi dhidi ya superuser mwenye uwezo wa kuizima
  au kuondoa table.
- Retention inayohitajika na SDD ni angalau miaka saba. Hakuna automatic purge
  iliyowekwa. Backup, archive na restore verification ni kazi za deployment/ops;
  zisifanye truncate ya audit table. Retention pekee haithibitishi backup ipo.
- Reverse proxies lazima ziwekwe kwenye trusted-proxy configuration inayofaa
  kabla ya kutegemea client IP; middleware haitafsiri headers za proxy yenyewe.

## Verification

```powershell
php artisan event:list
php -d extension=pdo_sqlite vendor/phpunit/phpunit/phpunit --do-not-cache-result
```

Tests hutumia SQLite memory na Gates za test pekee. PostgreSQL JSONB/UUID/IP,
trigger, runtime database role privileges na authentication halisi zinahitaji
integration verification kwenye database maalumu ya tests kabla ya production.
Usielekeze RefreshDatabase tests kwenye database yenye data inayotakiwa kubaki.
