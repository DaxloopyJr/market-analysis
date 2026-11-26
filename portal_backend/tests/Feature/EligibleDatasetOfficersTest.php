<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Institution;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RolesPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EligibleDatasetOfficersTest extends TestCase
{
    use RefreshDatabase;

    private function officer(string $role, int $institution, ?int $department = null): User
    {
        $user = User::factory()->create(['institution_id' => $institution, 'department_id' => $department, 'is_active' => true, 'status' => 'active']);
        $user->roles()->attach(Role::where('code', $role)->value('id'), ['status' => 'active', 'effective_from' => '2020-01-01']);

        return $user;
    }

    public function test_institution_dropdown_includes_self_and_rejects_foreign_scope(): void
    {
        $this->seed(RolesPermissionsSeeder::class);
        $a = Institution::create(['code' => 'A', 'name' => 'A', 'is_active' => true, 'status' => 'active']);
        $b = Institution::create(['code' => 'B', 'name' => 'B', 'is_active' => true, 'status' => 'active']);
        $self = $this->officer('IDO', $a->id);
        $this->officer('IDO', $b->id);
        $this->officer('IA', $a->id);
        $this->officer('IDO', $a->id)->update(['is_active' => false]);
        Sanctum::actingAs($self);
        $this->getJson('/api/v1/datasets/eligible-officers')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $self->id)->assertJsonMissingPath('data.0.email');
        $this->getJson('/api/v1/datasets/eligible-officers?institutionId='.$b->id)->assertForbidden();
        $this->getJson('/api/v1/users')->assertForbidden();
    }

    public function test_department_scope_and_moa_selection(): void
    {
        $this->seed(RolesPermissionsSeeder::class);
        $mit = Institution::create(['code' => 'MIT', 'name' => 'MIT', 'is_active' => true, 'status' => 'active']);
        $a = Department::create(['code' => 'A', 'name' => 'A', 'status' => 'active', 'is_active' => true]);
        $b = Department::create(['code' => 'B', 'name' => 'B', 'status' => 'active', 'is_active' => true]);
        $self = $this->officer('DDO', $mit->id, $a->id);
        $other = $this->officer('DDO', $mit->id, $b->id);
        Sanctum::actingAs($self);
        $this->getJson('/api/v1/datasets/eligible-officers')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $self->id);
        $this->getJson('/api/v1/datasets/eligible-officers?departmentId='.$b->id)->assertForbidden();
        Sanctum::actingAs($this->officer('MOA', $mit->id));
        $this->getJson('/api/v1/datasets/eligible-officers?institutionId='.$mit->id.'&departmentId='.$b->id)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $other->id);
    }
}
