<?php

namespace Tests\Feature;

use App\Models\ApprovalCircle;
use App\Models\Department;
use App\Models\Institution;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Database\Seeders\InstitutionSampleUsersSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class DatabaseSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_fresh_seed_has_scoped_users_permissions_and_active_workflows(): void
    {
        $this->seed(DatabaseSeeder::class);

        $this->assertDatabaseCount('institutions', 15);
        $this->assertDatabaseCount('users', 107);
        $this->assertDatabaseCount('roles', 14);
        $this->assertDatabaseCount('approval_circles', 15);
        $this->assertDatabaseCount('submissions', 0);
        $this->assertDatabaseCount('dataset_definitions', 2);
        $this->assertSame(['CA', 'CIA', 'DAHRM', 'DSME', 'DTD', 'DTI', 'GCU', 'ICT', 'MEU'], Department::orderBy('code')->pluck('code')->all());

        $ministry = Institution::where('code', 'MIT')->firstOrFail();
        foreach (Department::all() as $department) {
            $users = User::where('department_id', $department->id)->get();
            $this->assertCount(2, $users);
            foreach ($users as $user) {
                $this->assertSame($ministry->id, $user->institution_id);
                $this->assertTrue($user->canDo('submissions.submit'));
                $this->assertSame(['DDO'], $user->roles()->pluck('code')->all());
                $this->assertSame($department->id, $user->roles()->first()->pivot->department_id);
            }
        }

        foreach (Institution::where('code', '!=', 'MIT')->get() as $institution) {
            $users = User::where('institution_id', $institution->id)->get();
            $this->assertCount(6, $users);
            $this->assertSame(['AO', 'IA', 'IAU', 'IDO', 'IDO', 'IHOD'], $users->flatMap(fn ($user) => $user->roles()->pluck('code'))->sort()->values()->all());
            $auditor = $users->first(fn ($user) => $user->hasRole('IAU'));
            $this->assertTrue($auditor->canDo('audit_logs.view.institution'));
            $this->assertFalse($auditor->canDo('submissions.submit'));
            $this->assertFalse($auditor->canDo('submissions.publish'));
            foreach ($users as $user) {
                $this->assertNull($user->department_id);
                $this->assertTrue($user->is_active);
                $this->assertTrue(Hash::check('Password@123', $user->password));
                $this->assertSame($institution->id, $user->roles()->first()->pivot->institution_id);
            }
            $circle = ApprovalCircle::where('scope_key', 'institution-'.$institution->id)->where('is_active', true)->firstOrFail();
            $this->assertSame(['IHOD', 'AO'], $circle->steps()->pluck('required_role_code')->all());
            $this->assertSame(['review', 'approve'], $circle->steps()->pluck('action')->all());
        }

        $circle = ApprovalCircle::where('scope_key', 'global')->where('is_active', true)->firstOrFail();
        $this->assertSame(['MDO', 'MDD'], $circle->steps()->pluck('required_role_code')->all());
        $this->assertSame(['review', 'publish'], $circle->steps()->pluck('action')->all());
        $this->assertSame([true, true], $circle->steps()->pluck('can_return')->all());
        $this->assertTrue(User::where('email', 'dd@mit.go.tz')->firstOrFail()->canDo('submissions.publish'));
        $this->assertTrue(User::where('email', 'mdo@mit.go.tz')->firstOrFail()->canDo('datasets.view.ministry'));
        $auditor = User::where('email', 'mau@mit.go.tz')->firstOrFail();
        $this->assertSame($ministry->id, $auditor->institution_id);
        $this->assertNull($auditor->department_id);
        $this->assertSame(['MAU'], $auditor->roles()->pluck('code')->all());
        $this->assertTrue($auditor->canDo('audit_logs.view.ministry'));
        $this->assertFalse($auditor->canDo('submissions.publish'));
    }

    public function test_rerun_does_not_duplicate_records_or_reset_accounts_and_workflows(): void
    {
        $this->seed(DatabaseSeeder::class);
        $user = User::where('email', 'ddo1.ict@mit.go.tz')->firstOrFail();
        $user->update(['password' => 'ChangedPassword@456', 'is_active' => false, 'status' => 'inactive']);
        $circle = ApprovalCircle::where('scope_key', 'global')->firstOrFail();
        $circle->update(['name' => 'Administrator configuration']);
        $deleted = User::where('email', 'like', 'ido2@%')->firstOrFail();
        $deleted->delete();

        $this->seed(DatabaseSeeder::class);

        $this->assertDatabaseCount('users', 107);
        $this->assertDatabaseCount('user_role', 107);
        $this->assertDatabaseCount('approval_circles', 15);
        $this->assertDatabaseCount('departments', 9);
        $this->assertFalse($user->fresh()->is_active);
        $this->assertTrue(Hash::check('ChangedPassword@456', $user->fresh()->password));
        $this->assertSoftDeleted('users', ['id' => $deleted->id]);
        $this->assertSame('Administrator configuration', $circle->fresh()->name);
    }

    public function test_legacy_sample_email_is_renamed_without_replacing_identity_or_password(): void
    {
        $this->seed(DatabaseSeeder::class);
        $user = User::where('email', 'ido1@camartec.co.tz')->firstOrFail();
        $user->update(['email' => "sample.ido1.inst{$user->institution_id}@example.test", 'password' => 'MyChangedPassword@123']);
        $id = $user->id;
        $password = $user->password;

        $this->seed(InstitutionSampleUsersSeeder::class);

        $this->assertDatabaseCount('users', 107);
        $this->assertSame('ido1@camartec.co.tz', $user->fresh()->email);
        $this->assertSame($id, $user->fresh()->id);
        $this->assertSame($password, $user->fresh()->password);
        $this->assertTrue($user->fresh()->hasRole('IDO'));
    }

    public function test_production_seed_is_rejected_before_creating_test_accounts(): void
    {
        $this->app->instance('env', 'production');
        try {
            app(DatabaseSeeder::class)->run();
            $this->fail('Production sample seeding should be rejected.');
        } catch (\RuntimeException $exception) {
            $this->assertSame('Testing accounts must not be seeded in production.', $exception->getMessage());
        }

        $this->assertDatabaseCount('users', 0);
        $this->assertDatabaseCount('roles', 0);
    }
}
