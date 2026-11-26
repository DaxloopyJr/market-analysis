<?php

namespace Database\Seeders;

use App\Models\ApprovalCircle;
use App\Models\Department;
use App\Models\Institution;
use App\Models\Role;
use App\Models\User;
use App\Services\WorkflowConfigurationService;
use Illuminate\Database\Seeder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use RuntimeException;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        if (app()->environment('production')) {
            throw new RuntimeException('Testing accounts must not be seeded in production.');
        }

        DB::transaction(function () {
            $this->call(RolesPermissionsSeeder::class);
            $ministry = Institution::firstOrCreate(['code' => 'MIT'], [
                'name' => 'Ministry of Industry and Trade', 'type' => 'institution',
                'is_active' => true, 'status' => 'active',
            ]);

            // Source: https://www.viwanda.go.tz/pages/organisation-structure
            $institutions = [
                'BRELA' => 'Business Registrations and Licensing Agency',
                'CAMARTEC' => 'Centre for Agricultural Mechanisation and Rural Technology',
                'CBE' => 'College of Business Education',
                'FCC' => 'Fair Competition Commission',
                'FCT' => 'Fair Competition Tribunal',
                'NDC' => 'National Development Corporation',
                'SIDO' => 'Small Industries Development Organization',
                'TANTRADE' => 'Tanzania Trade Development Authority',
                'TBS' => 'Tanzania Bureau of Standards',
                'TEMDO' => 'Tanzania Engineering and Manufacturing Design Organization',
                'TIRDO' => 'Tanzania Industrial Research and Development Organization',
                'WMA' => 'Weights and Measures Agency',
                'WRRB' => 'Warehouse Receipts Regulatory Board',
            ];
            foreach ($institutions as $code => $name) {
                Institution::firstOrCreate(['code' => $code], [
                    'name' => $name, 'type' => 'institution', 'is_active' => true, 'status' => 'active',
                ]);
            }

            // Use requested codes without guessing their expanded official department names.
            $password = Hash::make('Password@123');
            foreach (['ICT', 'DTD', 'DTI', 'CA', 'CIA', 'DAHRM', 'GCU', 'DSME'] as $code) {
                $department = Department::firstOrCreate(['code' => $code], [
                    'name' => $code, 'is_active' => true, 'status' => 'active',
                ]);
                foreach ([1, 2] as $number) {
                    $this->createAccount('ddo'.$number.'.'.strtolower($code).'@mit.go.tz',
                        '[TEST] '.$code.' Data Officer '.$number, $ministry, $department, 'DDO', $password);
                }
            }

            // M&E reviewers serve all source institutions and departments.
            foreach ([
                ['moa@mit.go.tz', 'Ministry Overall Admin', 'MOA'],
                ['me@mit.go.tz', 'Ministry Executive', 'ME'],
                ['mdo@mit.go.tz', 'M&E Data Officer', 'MDO'],
                ['dd@mit.go.tz', 'M&E Director', 'MDD'],
                ['mau@mit.go.tz', 'Ministry Auditor', 'MAU'],
            ] as [$email, $name, $role]) {
                $this->createAccount($email, $name, $ministry, null, $role, $password);
            }

            $this->call(InstitutionSampleUsersSeeder::class);
            $this->seedWorkflows();
            $this->callWith(MonitoringEvaluationSeeder::class, ['seedDatasets' => false]);
            $this->call(HistoricalPublishedDatasetsSeeder::class);
        });

        $this->command?->info('New testing accounts: Password@123. Existing accounts and workflow configurations are preserved.');
    }

    private function createAccount(string $email, string $name, Institution $institution, ?Department $department, string $roleCode, string $password): void
    {
        $user = User::withTrashed()->firstOrCreate(['email' => $email], [
            'name' => $name, 'password' => $password, 'institution_id' => $institution->id,
            'department_id' => $department?->id, 'is_active' => true, 'status' => 'active',
            'failed_attempts' => 0, 'locked_until' => null,
        ]);

        // Reruns must not reset passwords, reactivate deleted users or replace scoped roles.
        if ($user->wasRecentlyCreated) {
            $user->roles()->attach(Role::where('code', $roleCode)->firstOrFail()->id, [
                'institution_id' => $institution->id, 'department_id' => $department?->id,
                'effective_from' => today()->toDateString(), 'effective_to' => null, 'status' => 'active',
            ]);
        }
    }

    private function seedWorkflows(): void
    {
        $this->createWorkflow(User::where('email', 'moa@mit.go.tz')->firstOrFail(), 'global', 'Ministry review and publication', [
            ['step_name' => 'M&E review', 'required_role_code' => 'MDO', 'action' => 'review', 'level' => 'ministry'],
            ['step_name' => 'Publication', 'required_role_code' => 'MDD', 'action' => 'publish', 'level' => 'ministry'],
        ]);

        foreach (Institution::where('code', '!=', 'MIT')->get() as $institution) {
            $admin = User::where('username', "sample_ia_inst{$institution->id}")->first();
            if ($admin) {
                $this->createWorkflow($admin, 'institution-'.$institution->id, $institution->code.' approval', [
                    ['step_name' => 'Institution review', 'required_role_code' => 'IHOD', 'action' => 'review', 'level' => 'institution'],
                    ['step_name' => 'Accounting officer approval', 'required_role_code' => 'AO', 'action' => 'approve', 'level' => 'institution'],
                ]);
            }
        }
    }

    private function createWorkflow(User $actor, string $scope, string $name, array $steps): void
    {
        // Preserve configurations created by administrators, including drafts and retired versions.
        if (ApprovalCircle::where('scope_key', $scope)->exists()) {
            return;
        }

        $request = Request::create('/seed/workflows', 'POST');
        $request->setUserResolver(fn () => $actor);
        $service = app(WorkflowConfigurationService::class);
        $circle = $service->save($request, ['name' => $name, 'steps' => $steps]);
        $service->activate($request, $circle->id);
    }
}
