<?php

namespace Tests\Feature;

use App\Models\ApprovalCircle;
use App\Models\AuditEvent;
use App\Models\DatasetDefinition;
use App\Models\DatasetReportingCalendar;
use App\Models\Department;
use App\Models\Indicator;
use App\Models\Institution;
use App\Models\ReportingPeriod;
use App\Models\Role;
use App\Models\Submission;
use App\Models\SubmissionApproval;
use App\Models\User;
use Carbon\Carbon;
use Database\Seeders\RolesPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DashboardApiTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $role, ?int $institution, ?int $department = null): User
    {
        $user = User::factory()->create(['institution_id' => $institution, 'department_id' => $department, 'is_active' => true, 'status' => 'active']);
        $user->roles()->attach(Role::where('code', $role)->firstOrFail()->id, ['status' => 'active', 'effective_from' => '2020-01-01']);

        return $user;
    }

    private function fixture(): array
    {
        $this->travelTo(Carbon::parse('2026-10-23 12:00:00', 'Africa/Dar_es_Salaam'));
        $this->seed(RolesPermissionsSeeder::class);
        $cbe = Institution::create(['code' => 'CBE', 'name' => 'CBE', 'status' => 'active', 'is_active' => true]);
        $other = Institution::create(['code' => 'OTHER', 'name' => 'Other', 'status' => 'active', 'is_active' => true]);
        $mit = Institution::create(['code' => 'MIT', 'name' => 'Ministry', 'status' => 'active', 'is_active' => true]);
        $moa = $this->user('MOA', $mit->id);
        $officer = $this->user('IDO', $cbe->id);
        $dataset = $this->dataset($cbe->id, $officer);
        $foreign = $this->dataset($other->id, $this->user('IDO', $other->id));
        Sanctum::actingAs($moa);

        return compact('cbe', 'other', 'mit', 'moa', 'officer', 'dataset', 'foreign');
    }

    private function dataset(int $institution, User $officer, ?int $department = null): DatasetDefinition
    {
        $dataset = DatasetDefinition::create(['dataset_code' => 'DS-'.(DatasetDefinition::count() + 1), 'dataset_name' => 'Staff',
            'institution_id' => $institution, 'department_id' => $department, 'responsible_user_id' => $officer->id, 'created_by' => $officer->id, 'status' => 'active']);
        $dataset->frequencies()->create(['frequency' => 'quarterly']);
        $dataset->templateVersions()->create(['version_number' => 1, 'template_format' => 'json', 'template_content' => ['indicators' => [], 'dimensions' => []],
            'created_by' => $officer->id, 'effective_from' => now()]);

        return $dataset;
    }

    private function submission(DatasetDefinition $dataset, string $status, string $stage = 'institution', string $start = '2026-07-01', int $step = 1): Submission
    {
        $institutionCircle = ApprovalCircle::firstOrCreate(['scope_key' => 'inst-'.$dataset->institution_id, 'version_number' => 1],
            ['name' => 'Institution', 'institution_id' => $dataset->institution_id, 'created_by' => $dataset->created_by]);
        $ministryCircle = ApprovalCircle::firstOrCreate(['scope_key' => 'global', 'version_number' => 1], ['name' => 'Ministry', 'created_by' => $dataset->created_by]);
        foreach ([[$institutionCircle, 'IHOD', 'institution'], [$ministryCircle, 'MDO', 'ministry']] as [$circle, $role, $level]) {
            $circle->steps()->firstOrCreate(['sequence' => 1], ['step_name' => 'Review', 'required_role_code' => $role, 'action' => 'review', 'level' => $level]);
            $circle->steps()->firstOrCreate(['sequence' => 2], ['step_name' => 'Approve', 'required_role_code' => $level === 'institution' ? 'AO' : 'MDD', 'action' => 'approve', 'level' => $level]);
        }
        $period = ReportingPeriod::create(['period_code' => 'P-'.(ReportingPeriod::count() + 1), 'period_type' => 'quarterly', 'year_type' => 'financial',
            'label' => 'Quarter', 'start_date' => $start, 'end_date' => Carbon::parse($start)->addMonths(3)->subDay(),
            'deadline' => Carbon::parse($start)->addMonths(3)->subDay(), 'created_by' => $dataset->created_by]);
        $calendar = DatasetReportingCalendar::create(['dataset_definition_id' => $dataset->id, 'reporting_period_id' => $period->id,
            'responsible_user_id' => $dataset->responsible_user_id, 'created_by' => $dataset->created_by, 'deadline' => $period->deadline,
            'deadline_days' => 0, 'reminder_days' => [], 'reminders_enabled' => false, 'submitted_at' => $status === 'draft' ? null : now()]);
        $submission = Submission::create(['reference' => 'S-'.$calendar->id, 'reporting_calendar_id' => $calendar->id,
            'template_version_id' => $dataset->templateVersions()->firstOrFail()->id, 'created_by' => $dataset->created_by,
            'approval_circle_id' => $status === 'draft' ? null : $institutionCircle->id, 'ministry_approval_circle_id' => $status === 'draft' ? null : $ministryCircle->id,
            'workflow_stage' => $status === 'draft' ? null : $stage, 'current_step' => in_array($status, ['draft', 'returned', 'published'], true) ? null : $step,
            'status' => $status, 'submitted_at' => $status === 'draft' ? null : now(), 'published_at' => $status === 'published' ? now() : null]);
        SubmissionApproval::create(['submission_id' => $submission->id, 'actor_id' => $dataset->created_by, 'action' => $status,
            'meta' => [], 'acted_at' => now()]);

        return $submission;
    }

    public function test_dashboard_aggregates_new_schema_and_uses_reporting_year_not_creation_year(): void
    {
        $f = $this->fixture();
        foreach (['draft', 'submitted', 'under_review', 'returned', 'approved', 'published'] as $status) {
            $this->submission($f['dataset'], $status, in_array($status, ['approved', 'published'], true) ? 'ministry' : 'institution');
        }
        $this->submission($f['foreign'], 'published', 'ministry');
        $old = $this->submission($f['dataset'], 'draft', 'institution', '2025-07-01');
        $response = $this->getJson('/api/v1/dashboard?fy=2026/27')->assertOk()->assertJsonPath('data.scope', 'ministry')
            ->assertJsonPath('data.cards.total_submissions', 7)->assertJsonPath('data.cards.draft', 1)
            ->assertJsonPath('data.cards.submitted', 1)->assertJsonPath('data.cards.under_review', 1)
            ->assertJsonPath('data.cards.approved', 1)->assertJsonPath('data.cards.published', 2)
            ->assertJsonCount(6, 'data.status_distribution')->assertJsonCount(2, 'data.published_data')
            ->assertJsonPath('data.cards.due_obligations', 7)->assertJsonPath('data.cards.overdue', 1)
            ->assertJsonPath('data.published_data.0.values', []);
        $this->assertNotContains($old->id, array_column($response->json('data.recent_activity'), 'submission_id'));
        $this->getJson('/api/v1/dashboard?fy=all')->assertOk()->assertJsonPath('data.cards.total_submissions', 8);
        $this->getJson('/api/v1/dashboard?fy=2026/2027')->assertOk()->assertJsonPath('data.cards.total_submissions', 7);
    }

    public function test_ministry_cards_count_all_active_datasets_and_only_current_pending_reviews(): void
    {
        $f = $this->fixture();
        $department = Department::create(['code' => 'ME', 'name' => 'Monitoring', 'status' => 'active', 'is_active' => true]);
        Department::create(['code' => 'EMPTY', 'name' => 'Empty', 'status' => 'active', 'is_active' => true]);
        Institution::create(['code' => 'ZERO', 'name' => 'Zero', 'status' => 'active', 'is_active' => true]);
        $departmentDataset = $this->dataset($f['mit']->id, $this->user('DDO', $f['mit']->id, $department->id), $department->id);
        $this->dataset($f['cbe']->id, $f['officer']);
        $this->dataset($f['cbe']->id, $f['officer'])->update(['status' => 'draft']);
        $this->dataset($f['cbe']->id, $f['officer'])->update(['status' => 'inactive']);
        $this->submission($f['dataset'], 'under_review', 'ministry');
        $this->submission($f['dataset'], 'under_review', 'ministry');
        $this->submission($f['dataset'], 'under_review', 'ministry', step: 2);
        $this->submission($f['dataset'], 'submitted', 'institution');
        $this->submission($f['dataset'], 'published', 'ministry');
        $this->submission($departmentDataset, 'under_review', 'ministry');
        foreach (['MDO' => 2, 'MDD' => 1] as $role => $pending) {
            $actor = $this->user($role, $f['mit']->id);
            Sanctum::actingAs($actor);
            $this->getJson('/api/v1/institutions?search=cbe&perPage=1')->assertOk()
                ->assertJsonPath('data.total', 1)->assertJsonPath('data.data.0.active_datasets_count', 2)
                ->assertJsonPath('data.data.0.pending_review_count', $pending);
            $this->getJson('/api/v1/institutions?search=zero')->assertOk()
                ->assertJsonPath('data.data.0.active_datasets_count', 0)->assertJsonPath('data.data.0.pending_review_count', 0);
            $this->getJson('/api/v1/departments?search=monitor')->assertOk()
                ->assertJsonPath('data.data.0.active_datasets_count', 1)
                ->assertJsonPath('data.data.0.pending_review_count', $role === 'MDO' ? 1 : 0);
            $this->getJson('/api/v1/departments?search=empty')->assertOk()->assertJsonPath('data.data.0.active_datasets_count', 0);
            $this->getJson('/api/v1/dashboard')->assertOk()->assertJsonPath('data.cards.active_datasets', 4);
            $this->getJson('/api/v1/datasets?institutionId='.$f['cbe']->id.'&perPage=1')->assertOk()->assertJsonPath('total', 2)->assertJsonCount(1, 'data');
            $this->getJson('/api/v1/datasets?departmentId='.$department->id)->assertOk()->assertJsonPath('total', 1);
        }
        $impostor = $this->user('MDO', $f['cbe']->id);
        Sanctum::actingAs($impostor);
        $this->getJson('/api/v1/institutions')->assertForbidden();
        $this->getJson('/api/v1/datasets')->assertForbidden();
    }

    public function test_card_pending_counts_respect_assignment_and_institution_scope(): void
    {
        $f = $this->fixture();
        $submission = $this->submission($f['dataset'], 'under_review', 'ministry');
        $assigned = $this->user('MDO', $f['mit']->id);
        $submission->ministryCircle->steps()->where('sequence', 1)->update(['assigned_user_id' => $assigned->id]);
        Sanctum::actingAs($this->user('MDO', $f['mit']->id));
        $this->getJson('/api/v1/institutions?search=CBE')->assertOk()->assertJsonPath('data.data.0.pending_review_count', 0);
        Sanctum::actingAs($assigned);
        $this->getJson('/api/v1/institutions?search=CBE')->assertOk()->assertJsonPath('data.data.0.pending_review_count', 1);
        Sanctum::actingAs($this->user('IA', $f['cbe']->id));
        $this->getJson('/api/v1/institutions')->assertOk()->assertJsonPath('data.total', 1)->assertJsonPath('data.data.0.id', $f['cbe']->id);
        $this->getJson('/api/v1/institutions?perPage=101')->assertUnprocessable();
    }

    public function test_institution_and_officer_scope_cannot_be_expanded_by_filters(): void
    {
        $f = $this->fixture();
        $mine = $this->submission($f['dataset'], 'draft');
        $this->submission($f['foreign'], 'published', 'ministry');
        $colleague = $this->dataset($f['cbe']->id, $this->user('IDO', $f['cbe']->id));
        $this->submission($colleague, 'draft');
        Sanctum::actingAs($this->user('IA', $f['cbe']->id));
        $this->getJson('/api/v1/dashboard')->assertOk()->assertJsonPath('data.cards.total_submissions', 2)->assertJsonPath('data.filters', null);
        $this->getJson('/api/v1/dashboard?institution_id='.$f['other']->id)->assertForbidden();
        Sanctum::actingAs($f['officer']);
        $this->getJson('/api/v1/dashboard')->assertOk()->assertJsonPath('data.cards.total_submissions', 1)
            ->assertJsonPath('data.recent_activity.0.submission_id', $mine->id)->assertJsonPath('data.cards.active_datasets', 1);
    }

    public function test_pending_approvals_follow_current_step_assignment_and_ministry_handoff(): void
    {
        $f = $this->fixture();
        $institution = $this->submission($f['dataset'], 'submitted');
        $arrived = $this->submission($f['dataset'], 'under_review', 'ministry');
        $this->submission($f['dataset'], 'returned');
        $reviewer = $this->user('IHOD', $f['cbe']->id);
        $institution->circle->steps()->where('sequence', 1)->update(['assigned_user_id' => $reviewer->id]);
        Sanctum::actingAs($reviewer);
        $this->getJson('/api/v1/dashboard')->assertOk()->assertJsonPath('data.cards.pending_approvals', 1)->assertJsonPath('data.pending_approvals.0.id', $institution->id);
        Sanctum::actingAs($this->user('IHOD', $f['cbe']->id));
        $this->getJson('/api/v1/dashboard')->assertOk()->assertJsonPath('data.cards.pending_approvals', 0);
        Sanctum::actingAs($this->user('MDO', $f['mit']->id));
        $this->getJson('/api/v1/dashboard')->assertOk()->assertJsonPath('data.scope', 'ministry')
            ->assertJsonPath('data.cards.total_submissions', 1)->assertJsonPath('data.cards.pending_approvals', 1)
            ->assertJsonPath('data.pending_approvals.0.id', $arrived->id)->assertJsonPath('data.cards.awaiting_ministry', 1);
    }

    public function test_readers_only_see_released_approved_or_published_data(): void
    {
        $f = $this->fixture();
        $this->submission($f['dataset'], 'draft');
        $this->submission($f['dataset'], 'under_review', 'ministry');
        $this->submission($f['dataset'], 'approved', 'institution');
        $this->submission($f['dataset'], 'approved', 'ministry');
        $this->submission($f['dataset'], 'published', 'ministry');
        $this->submission($f['foreign'], 'published', 'ministry');
        Sanctum::actingAs($this->user('IM', $f['cbe']->id));
        $this->getJson('/api/v1/dashboard')->assertOk()->assertJsonPath('data.cards.total_submissions', 2)
            ->assertJsonPath('data.cards.draft', 0)->assertJsonCount(1, 'data.published_data')->assertJsonPath('data.cards.pending_approvals', 0);
        Sanctum::actingAs($this->user('ME', $f['mit']->id));
        $this->getJson('/api/v1/dashboard')->assertOk()->assertJsonPath('data.scope', 'ministry')->assertJsonPath('data.cards.total_submissions', 3);
    }

    public function test_department_scope_and_missing_scope_fail_closed(): void
    {
        $f = $this->fixture();
        $one = Department::create(['code' => 'ONE', 'name' => 'One', 'is_active' => true, 'status' => 'active']);
        $two = Department::create(['code' => 'TWO', 'name' => 'Two', 'is_active' => true, 'status' => 'active']);
        $officer = $this->user('DDO', $f['mit']->id, $one->id);
        $this->submission($this->dataset($f['mit']->id, $officer, $one->id), 'draft');
        $this->submission($this->dataset($f['mit']->id, $officer, $two->id), 'draft');
        Sanctum::actingAs($officer);
        $this->getJson('/api/v1/dashboard')->assertOk()->assertJsonPath('data.scope', 'department')->assertJsonPath('data.cards.total_submissions', 1);
        $this->getJson('/api/v1/dashboard?department_id='.$two->id)->assertForbidden();
        $officer->update(['department_id' => null]);
        $this->getJson('/api/v1/dashboard')->assertForbidden();
        Sanctum::actingAs($this->user('IDO', null));
        $this->getJson('/api/v1/dashboard')->assertForbidden();
    }

    public function test_filters_validation_empty_state_and_authentication(): void
    {
        $this->getJson('/api/v1/dashboard')->assertUnauthorized();
        $f = $this->fixture();
        $this->getJson('/api/v1/dashboard')->assertOk()->assertJsonPath('data.cards.total_submissions', 0)->assertJsonPath('data.cards.compliance_rate', 0);
        foreach (['bad', '2026/29', '2026/2028', '2026'] as $fy) {
            $this->getJson('/api/v1/dashboard?fy='.$fy)->assertUnprocessable()->assertJsonValidationErrors('fy');
        }
        $this->getJson('/api/v1/dashboard?institution_id=invalid')->assertUnprocessable();
        $this->submission($f['dataset'], 'draft');
        $this->submission($f['foreign'], 'draft');
        $this->getJson('/api/v1/dashboard?institution_id='.$f['cbe']->id)->assertOk()->assertJsonPath('data.cards.total_submissions', 1)->assertJsonCount(1, 'data.by_institution');
        Sanctum::actingAs(User::factory()->create());
        $this->getJson('/api/v1/dashboard')->assertForbidden();
    }

    public function test_feed_limits_do_not_truncate_counts_and_only_published_values_are_exposed(): void
    {
        $f = $this->fixture();
        $indicator = new Indicator(['indicator_code' => 'STAFF', 'name_en' => 'Staff', 'data_type' => 'integer']);
        $indicator->created_by = $f['officer']->id;
        $indicator->save();
        for ($i = 0; $i < 21; $i++) {
            $published = $this->submission($f['dataset'], 'published', 'ministry');
            $published->values()->create(['indicator_id' => $indicator->id, 'dimension_values' => [], 'dimension_key' => hash('sha256', '[]'), 'data_type' => 'integer', 'value_numeric' => 123]);
        }
        $draft = $this->submission($f['dataset'], 'draft');
        $draft->values()->create(['indicator_id' => $indicator->id, 'dimension_values' => [], 'dimension_key' => hash('sha256', '[]'), 'data_type' => 'integer', 'value_numeric' => 987654]);
        $before = AuditEvent::count();

        $response = $this->getJson('/api/v1/dashboard')->assertOk()->assertJsonPath('data.cards.published', 21)
            ->assertJsonCount(20, 'data.published_data')->assertJsonCount(20, 'data.recent_activity')
            ->assertJsonPath('data.published_data.0.values.0.value', '123');

        $this->assertStringNotContainsString('987654', $response->getContent());
        $this->assertSame($before, AuditEvent::count());
        $this->assertDatabaseHas('submissions', ['id' => $draft->id, 'status' => 'draft']);
    }

    public function test_missing_submission_is_overdue_but_future_calendar_is_not(): void
    {
        $f = $this->fixture();
        $missed = $this->submission($f['dataset'], 'draft');
        $future = $this->submission($f['dataset'], 'draft', 'institution', '2027-01-01');
        SubmissionApproval::where('submission_id', $missed->id)->delete();
        $missed->delete();
        Sanctum::actingAs($f['officer']);
        $this->getJson('/api/v1/dashboard')->assertOk()->assertJsonPath('data.cards.overdue', 1)
            ->assertJsonPath('data.cards.due_obligations', 1)->assertJsonPath('data.obligations.0.submission_id', null)
            ->assertJsonPath('data.obligations.0.status', 'overdue')->assertJsonPath('data.obligations.1.status', 'upcoming')
            ->assertJsonPath('data.obligations.1.submission_id', $future->id);
    }

    public function test_legacy_workflow_and_self_review_exclusion(): void
    {
        $f = $this->fixture();
        $submission = $this->submission($f['dataset'], 'submitted', 'ministry');
        $submission->update(['workflow_stage' => null, 'approval_circle_id' => $submission->ministry_approval_circle_id]);
        Sanctum::actingAs($this->user('MDO', $f['mit']->id));
        $this->getJson('/api/v1/dashboard')->assertOk()->assertJsonPath('data.cards.pending_approvals', 1);
        $this->submission($f['dataset'], 'submitted');
        $f['officer']->roles()->attach(Role::where('code', 'IHOD')->value('id'), ['status' => 'active', 'effective_from' => '2020-01-01']);
        Sanctum::actingAs($f['officer']);
        $this->getJson('/api/v1/dashboard')->assertOk()->assertJsonPath('data.cards.pending_approvals', 0);
    }
}
