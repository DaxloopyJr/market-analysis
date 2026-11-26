<?php

namespace Tests\Feature;

use App\DTOs\AuditEventData;
use App\Events\AuditEventOccurred;
use App\Models\AuditEvent;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;
use Tests\TestCase;

class AuditContextMiddlewareTest extends TestCase
{
    use RefreshDatabase;

    public function test_api_requests_receive_unique_server_generated_ids_without_creating_audit_records(): void
    {
        $suppliedId = '550e8400-e29b-41d4-a716-446655440000';
        $firstResponse = $this->getJson('/api/health', ['X-Request-ID' => $suppliedId]);
        $secondResponse = $this->getJson('/api/health');

        $firstResponse->assertOk()->assertHeader('X-Request-ID');
        $secondResponse->assertOk()->assertHeader('X-Request-ID');
        $firstId = $firstResponse->headers->get('X-Request-ID');
        $secondId = $secondResponse->headers->get('X-Request-ID');

        $this->assertTrue(Str::isUuid($firstId));
        $this->assertTrue(Str::isUuid($secondId));
        $this->assertNotSame($suppliedId, $firstId);
        $this->assertNotSame($firstId, $secondId);
        $this->assertDatabaseCount('audit_events', 0);
    }

    public function test_http_context_reaches_the_event_listener_and_database(): void
    {
        // Route hii ipo kwenye tests pekee, haiongezwi kwenye routes za application.
        Route::middleware('api')->post('/api/_test/audit-context', function (Request $request) {
            AuditEventOccurred::dispatch(new AuditEventData(
                eventType: 'contextTest',
                actorType: 'system',
                ipAddress: $request->attributes->get('auditIpAddress'),
                requestId: $request->attributes->get('auditRequestId'),
            ));

            return response()->json(['requestId' => $request->attributes->get('auditRequestId')]);
        });

        $response = $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.10'])
            ->postJson('/api/_test/audit-context', [
                'auditRequestId' => 'forged-id',
                'auditIpAddress' => '203.0.113.99',
            ]);

        $response->assertOk();
        $this->assertDatabaseCount('audit_events', 1);
        $auditEvent = AuditEvent::firstOrFail();
        $this->assertTrue(Str::isUuid($auditEvent->request_id));
        $this->assertSame($response->headers->get('X-Request-ID'), $auditEvent->request_id);
        $this->assertSame($response->json('requestId'), $auditEvent->request_id);
        $this->assertSame('192.0.2.10', $auditEvent->ip_address);
    }
}
