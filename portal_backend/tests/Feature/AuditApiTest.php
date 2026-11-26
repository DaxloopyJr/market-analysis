<?php

namespace Tests\Feature;

use App\DTOs\AuditEventData;
use App\Models\User;
use App\Services\AuditService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Gate;
use Tests\TestCase;

class AuditApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_guests_and_users_without_permission_cannot_read_audits(): void
    {
        $this->getJson('/api/v1/audit-events')->assertUnauthorized();
        $this->getJson('/api/v1/audit-events/1')->assertUnauthorized();
        $this->actingAs(User::factory()->create());
        $this->getJson('/api/v1/audit-events')->assertForbidden();
        $this->getJson('/api/v1/audit-events/1')->assertForbidden();
    }

    public function test_authorized_reader_can_filter_paginate_and_read_one_record(): void
    {
        $this->authorizeReader();
        $this->freezeTime();
        $service = app(AuditService::class);
        $service->record(new AuditEventData(eventType: 'ignored'));
        $olderEvent = $service->record(new AuditEventData(eventType: 'datasetUpdated', entityType: 'dataset', entityId: '1'));
        $newerEvent = $service->record(new AuditEventData(eventType: 'datasetUpdated', entityType: 'dataset', entityId: '1'));

        $this->getJson('/api/v1/audit-events?eventType=datasetUpdated&entityType=dataset&entityId=1&perPage=1')
            ->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('meta.total', 2)->assertJsonPath('data.0.id', $newerEvent->id)
            ->assertJsonPath('data.0.eventType', 'datasetUpdated');
        $this->getJson('/api/v1/audit-events?eventType=datasetUpdated&perPage=1&page=2')
            ->assertOk()->assertJsonPath('data.0.id', $olderEvent->id);
        $this->getJson('/api/v1/audit-events/'.$olderEvent->id)
            ->assertOk()->assertJsonPath('data.id', $olderEvent->id)->assertJsonMissingPath('data.user');
        $this->getJson('/api/v1/audit-events/999999')->assertNotFound();
    }

    public function test_invalid_filters_are_rejected(): void
    {
        $this->authorizeReader();
        $this->getJson('/api/v1/audit-events?perPage=101&page=0&requestId=bad&userId=-1&startDate=2026-10-17&endDate=2026-10-16')
            ->assertUnprocessable()->assertJsonValidationErrors(['perPage', 'page', 'requestId', 'userId', 'endDate']);
        $this->getJson('/api/v1/audit-events?startDate[]=2026-10-17&eventType[]=bad')
            ->assertUnprocessable()->assertJsonValidationErrors(['startDate', 'eventType']);
    }

    public function test_date_filters_include_end_date_and_exclude_the_next_day(): void
    {
        $this->authorizeReader();
        $service = app(AuditService::class);
        $this->travelTo(now()->setDate(2026, 10, 17)->startOfDay());
        $firstEvent = $service->record(new AuditEventData(eventType: 'created'));
        $this->travelTo(now()->endOfDay());
        $lastEvent = $service->record(new AuditEventData(eventType: 'created'));
        $this->travelTo(now()->addDay()->startOfDay());
        $service->record(new AuditEventData(eventType: 'created'));
        $this->getJson('/api/v1/audit-events?startDate=2026-10-17&endDate=2026-10-17')
            ->assertOk()->assertJsonPath('meta.total', 2)
            ->assertJsonPath('data.0.id', $lastEvent->id)->assertJsonPath('data.1.id', $firstEvent->id);
    }

    public function test_write_endpoints_are_not_available(): void
    {
        $this->authorizeReader();
        $this->postJson('/api/v1/audit-events', [])->assertStatus(405);
        $this->patchJson('/api/v1/audit-events/1', [])->assertStatus(405);
        $this->deleteJson('/api/v1/audit-events/1')->assertStatus(405);
    }

    private function authorizeReader(): void
    {
        $reader = User::factory()->create(['is_active' => true, 'status' => 'active']);
        // Gate hii ni ya test pekee; production hutegemea RBAC ya Auth.
        Gate::define('audit.readAll', fn (User $user): bool => $user->id === $reader->id);
        $this->actingAs($reader);
    }
}
