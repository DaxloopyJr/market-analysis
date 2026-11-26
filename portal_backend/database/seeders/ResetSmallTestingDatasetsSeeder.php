<?php

namespace Database\Seeders;

use App\Models\Institution;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/** Explicit opt-in reset of dataset/submission testing data; never called by DatabaseSeeder. */
class ResetSmallTestingDatasetsSeeder extends Seeder
{
    public function run(): void
    {
        if (! app()->environment(['local', 'testing'])) {
            throw new RuntimeException('Dataset fixture reset is restricted to local/testing.');
        }
        DB::transaction(function () {
            // Delete children first, with foreign keys enabled. Keep users, reference data and audit history.
            foreach ([
                'submission_template_archives', 'submission_approvals', 'submission_revisions', 'submission_values',
                'submissions', 'dataset_reminders', 'dataset_reporting_calendars',
                'indicator_targets', 'dataset_annual_targets', 'dataset_annual_objectives', 'dataset_annual_budgets',
                'dataset_dimension_indicators', 'dataset_dimensions', 'dataset_indicators',
                'dataset_frequencies', 'dataset_consumers', 'dataset_sectors', 'dataset_subsectors',
                'template_versions', 'dataset_definitions',
            ] as $table) {
                DB::table($table)->delete();
            }
            $institution = Institution::where('code', 'NCAC')->first();
            if ($institution) {
                // Retain identities referenced by historical audit events, but remove access and registry visibility.
                User::where('institution_id', $institution->id)->update(['is_active' => false, 'status' => 'inactive']);
                DB::table('user_role')->where('institution_id', $institution->id)->update(['status' => 'inactive']);
                $institution->update(['is_active' => false, 'status' => 'inactive']);
                $institution->delete();
            }
            $this->call(DatabaseSeeder::class);
        });
    }
}
