<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Seeder;

/**
 * Translated from: System Structure Matrix - Ministry Information Sharing Portal (Oct 2026).
 * Role codes: ME, MOA, IA, IDO, DDO, OMU, IM, IHOD, AO, MDO, MDD
 */
class RolesPermissionsSeeder extends Seeder
{
    public function run(): void
    {
        $roles = [
            ['code' => 'PREVIEW', 'name' => 'Preview / Read Only', 'level' => 'ministry', 'description' => 'Read published dataset analytics across institutions and departments; no workflow or administration rights.'],
            ['code' => 'IAU', 'name' => 'Institution Auditor', 'level' => 'institution', 'description' => 'Read-only audit of own institution datasets, submissions and activity.'],
            ['code' => 'MAU', 'name' => 'Ministry Auditor', 'level' => 'ministry', 'description' => 'Read-only audit across institutions and ministry departments.'],
            ['code' => 'ME',  'name' => 'Ministry Executive',        'level' => 'ministry',     'description' => 'Senior leadership (PS, Deputy PS, directors) - oversight, read-oriented access.'],
            ['code' => 'MOA', 'name' => 'Ministry Overall Admin',    'level' => 'ministry',     'description' => 'Portal administrator at ministry level; full configuration rights.'],
            ['code' => 'IA',  'name' => 'Institutional Admin',       'level' => 'institution',  'description' => 'Administrator of a specific institution; scoped rights to own institution.'],
            ['code' => 'IDO', 'name' => 'Institutional Data Officer', 'level' => 'institution',  'description' => 'Prepares and submits institution data.'],
            ['code' => 'DDO', 'name' => 'Departmental Data Officer', 'level' => 'ministry',     'description' => 'Prepares and submits ministry department data.'],
            ['code' => 'OMU', 'name' => 'Other Ministry Users',      'level' => 'ministry',     'description' => 'Any other authenticated ministry staff (technical units, planners).'],
            ['code' => 'IM',  'name' => 'Institutional Users',       'level' => 'institution',  'description' => 'Read/consume data within an institution.'],
            ['code' => 'IHOD', 'name' => 'Institutional Head of Department',        'level' => 'institution',  'description' => 'Reviews IDO/DDO submissions before they move up the approval circle.'],
            ['code' => 'AO',  'name' => 'Accounting Officer',        'level' => 'institution',  'description' => 'Approves institutional data and releases it to the ministry.'],
            ['code' => 'MDO', 'name' => 'Ministry Data Officer',     'level' => 'ministry',     'description' => 'Receives, reviews and forwards ministry-level data.'],
            ['code' => 'MDD',  'name' => 'Ministry Department Director',       'level' => 'ministry',     'description' => 'Final approver; publishes data to the dashboard.'],
        ];
        foreach ($roles as $r) {
            Role::updateOrCreate(['code' => $r['code']], $r + ['is_active' => true, 'status' => 'active', 'is_system' => true]);
        }

        // permission code convention: {module}.{action}  scope: own|institution|ministry
        $permissions = [
            // Reference data ni za pamoja; ruhusa hii haitenganishi rekodi kwa taasisi.
            ['code' => 'reference_data.manage', 'nav_item' => 'Reference Data', 'access_level' => 'Configure', 'scope' => 'own', 'description' => 'Kusimamia reference data za pamoja (MOA na IA).'],
            // Dashboard
            ['code' => 'dashboard.view',            'nav_item' => 'Dashboard',           'access_level' => 'View',      'scope' => 'own',        'description' => 'View role-filtered dashboard widgets.'],
            // Submissions
            ['code' => 'submissions.create',        'nav_item' => 'Submissions',         'access_level' => 'Create',    'scope' => 'own',        'description' => 'Create new submission (IDO/DDO).'],
            ['code' => 'submissions.edit',          'nav_item' => 'Submissions',         'access_level' => 'Edit',      'scope' => 'own',        'description' => 'Edit draft/returned submissions.'],
            ['code' => 'submissions.submit',        'nav_item' => 'Submissions',         'access_level' => 'Submit',    'scope' => 'own',        'description' => 'Forward draft into approval workflow.'],
            ['code' => 'submissions.review',        'nav_item' => 'Submissions',         'access_level' => 'Review',    'scope' => 'own',        'description' => 'Review, return with comments, forward (IHOD/MDO).'],
            ['code' => 'submissions.approve',       'nav_item' => 'Submissions',         'access_level' => 'Approve',   'scope' => 'own',        'description' => 'Approve at approver level (AO/MDO/MDD).'],
            ['code' => 'submissions.publish',       'nav_item' => 'Submissions',         'access_level' => 'Publish',   'scope' => 'ministry',   'description' => 'Publish approved data to dashboard (MDD).'],
            ['code' => 'submissions.view.approved', 'nav_item' => 'Submissions (readers)', 'access_level' => 'View',     'scope' => 'own',        'description' => 'View approved/published submissions only (ME/OMU/IM).'],
            ['code' => 'submissions.view.scope',    'nav_item' => 'Submissions',         'access_level' => 'View',      'scope' => 'institution', 'description' => 'View submissions within own scope.'],
            // Dataset management
            ['code' => 'datasets.configure',        'nav_item' => 'Dataset Management',  'access_level' => 'Configure', 'scope' => 'institution', 'description' => 'Create/edit/deactivate dataset definitions (MOA all, IA own institution).'],
            ['code' => 'datasets.view',             'nav_item' => 'Dataset Management',  'access_level' => 'View',      'scope' => 'own',        'description' => 'View assigned datasets.'],
            ['code' => 'datasets.view.ministry',    'nav_item' => 'Dataset Management',  'access_level' => 'View',      'scope' => 'ministry',  'description' => 'View all active institution and department datasets (MDO/MDD).'],
            ['code' => 'data_consumers.configure',  'nav_item' => 'Data Consumers',      'access_level' => 'Configure', 'scope' => 'institution', 'description' => 'Configure consumers per dataset.'],
            ['code' => 'data_consumers.view',       'nav_item' => 'Data Consumers',      'access_level' => 'View',      'scope' => 'own',        'description' => 'View datasets granted to consumer.'],
            ['code' => 'submission_periods.configure', 'nav_item' => 'Submission Periods', 'access_level' => 'Configure', 'scope' => 'institution', 'description' => 'Create/edit/close/re-open submission periods.'],
            ['code' => 'submission_periods.view',   'nav_item' => 'Submission Periods',  'access_level' => 'View',      'scope' => 'own',        'description' => 'View current and upcoming periods.'],
            // Administration
            ['code' => 'institutions.manage',       'nav_item' => 'Institutions',        'access_level' => 'Configure', 'scope' => 'ministry',   'description' => 'Create/edit/deactivate institutions (MOA).'],
            ['code' => 'institutions.view.own',     'nav_item' => 'Institutions',        'access_level' => 'View',      'scope' => 'institution', 'description' => 'View own institution record only (IA).'],
            ['code' => 'institutions.view.ministry', 'nav_item' => 'Institutions',        'access_level' => 'View',      'scope' => 'ministry',   'description' => 'View institutions (MDO).'],
            ['code' => 'departments.manage',        'nav_item' => 'Ministry Departments', 'access_level' => 'Configure', 'scope' => 'ministry',   'description' => 'Create/edit/deactivate ministry departments (MOA).'],
            ['code' => 'departments.view',          'nav_item' => 'Ministry Departments', 'access_level' => 'View',      'scope' => 'ministry',   'description' => 'View ministry departments (MDO).'],
            ['code' => 'institutional_admins.manage', 'nav_item' => 'Institutional Admins', 'access_level' => 'Configure', 'scope' => 'ministry',   'description' => 'Create/edit/deactivate institutional admins (MOA).'],
            ['code' => 'users.manage.ministry',     'nav_item' => 'Users',               'access_level' => 'Configure', 'scope' => 'ministry',   'description' => 'Create/edit/deactivate any portal user (MOA).'],
            ['code' => 'users.manage.institution',  'nav_item' => 'Users',               'access_level' => 'Configure', 'scope' => 'institution', 'description' => 'Create/edit/deactivate own institution users (IA).'],
            ['code' => 'roles.manage',              'nav_item' => 'Roles and Permissions', 'access_level' => 'Configure', 'scope' => 'ministry',   'description' => 'Create roles, update permissions, assign roles (MOA).'],
            ['code' => 'portal_settings.manage',    'nav_item' => 'Portal Settings',     'access_level' => 'Configure', 'scope' => 'ministry',   'description' => 'Portal name, logo, contacts, announcements (MOA).'],
            ['code' => 'approval_circle.manage.ministry', 'nav_item' => 'Approval Circle', 'access_level' => 'Configure', 'scope' => 'ministry',   'description' => 'Configure global/ministry-level approval circle (MOA).'],
            ['code' => 'approval_circle.manage.institution', 'nav_item' => 'Approval Circle', 'access_level' => 'Configure', 'scope' => 'institution', 'description' => 'Configure own institution approval circle - IHOD/AO steps (IA).'],
            // Analytics / Reports / Audit
            ['code' => 'analytics.view.published', 'nav_item' => 'Institution Analytics', 'access_level' => 'View', 'scope' => 'own', 'description' => 'Read published analytics across all organisations, regardless of the reader institution.'],
            ['code' => 'analytics.view.ministry',   'nav_item' => 'Institution Analytics', 'access_level' => 'View',     'scope' => 'ministry',   'description' => 'View ministry-wide analytics (ME/OMU/MOA).'],
            ['code' => 'analytics.view.institution', 'nav_item' => 'Institution Analytics', 'access_level' => 'View',     'scope' => 'institution', 'description' => 'View own institution analytics (IA).'],
            ['code' => 'analytics.view.own',        'nav_item' => 'Institution Analytics', 'access_level' => 'View',     'scope' => 'own',        'description' => 'View own-scope analytics where granted.'],
            ['code' => 'reports.view.ministry',     'nav_item' => 'Reports',             'access_level' => 'View',      'scope' => 'ministry',   'description' => 'Generate/export all portal reports (MOA).'],
            ['code' => 'reports.view.institution',  'nav_item' => 'Reports (scoped)',    'access_level' => 'View',      'scope' => 'institution', 'description' => 'Generate/export own institution reports (IA).'],
            ['code' => 'reports.view.own',          'nav_item' => 'Reports (scoped)',    'access_level' => 'View',      'scope' => 'own',        'description' => 'View/export reports within scope.'],
            ['code' => 'audit_logs.view.ministry',  'nav_item' => 'Audit Logs',          'access_level' => 'View',      'scope' => 'ministry',   'description' => 'View all audit logs - read only (MOA).'],
            ['code' => 'audit_logs.view.institution', 'nav_item' => 'Audit Logs (scoped)', 'access_level' => 'View',      'scope' => 'institution', 'description' => 'View own institution audit logs (IA).'],
        ];

        // Recommended starting grants. MOA receives every permission below.
        // Administrators can change each report independently in role management.
        $reportRoles = [
            'data-submission' => ['ME', 'IA', 'IDO', 'DDO', 'OMU', 'IM', 'IHOD', 'AO', 'MDO', 'MDD', 'IAU', 'MAU'],
            'submission-compliance' => ['ME', 'IA', 'IDO', 'DDO', 'IHOD', 'AO', 'MDO', 'MDD', 'IAU', 'MAU'],
            'outstanding-overdue' => ['ME', 'IA', 'IDO', 'DDO', 'IHOD', 'AO', 'MDO', 'MDD', 'IAU', 'MAU'],
            'approval-turnaround' => ['ME', 'IA', 'IDO', 'DDO', 'IHOD', 'AO', 'MDO', 'MDD', 'IAU', 'MAU'],
            'returned-corrections' => ['IA', 'IDO', 'DDO', 'IHOD', 'AO', 'MDO', 'MDD', 'IAU', 'MAU'],
            'published-register' => ['ME', 'IA', 'IDO', 'DDO', 'OMU', 'IM', 'IHOD', 'AO', 'MDO', 'MDD', 'IAU', 'MAU'],
            'data-quality' => ['ME', 'IA', 'IDO', 'DDO', 'IHOD', 'AO', 'MDO', 'MDD', 'IAU', 'MAU'],
            'indicator-performance' => ['ME', 'IA', 'IDO', 'DDO', 'OMU', 'IM', 'IHOD', 'AO', 'MDO', 'MDD', 'IAU', 'MAU'],
            'quarterly-trend' => ['ME', 'IA', 'IDO', 'DDO', 'OMU', 'IM', 'IHOD', 'AO', 'MDO', 'MDD', 'IAU', 'MAU'],
            'strategic-objective' => ['ME', 'IA', 'IDO', 'DDO', 'OMU', 'IM', 'IHOD', 'AO', 'MDO', 'MDD', 'IAU', 'MAU'],
            'organisation-performance' => ['ME', 'IA', 'IDO', 'DDO', 'OMU', 'IM', 'IHOD', 'AO', 'MDO', 'MDD', 'IAU', 'MAU'],
            'sector-performance' => ['ME', 'IA', 'IDO', 'DDO', 'OMU', 'IM', 'IHOD', 'AO', 'MDO', 'MDD', 'IAU', 'MAU'],
            'target-exceptions' => ['ME', 'IA', 'IDO', 'DDO', 'OMU', 'IHOD', 'AO', 'MDO', 'MDD', 'IAU', 'MAU'],
            'budget-delivery' => ['ME', 'IA', 'OMU', 'IHOD', 'AO', 'MDO', 'MDD', 'IAU', 'MAU'],
            'annual-me' => ['ME', 'IA', 'IDO', 'DDO', 'OMU', 'IM', 'IHOD', 'AO', 'MDO', 'MDD', 'IAU', 'MAU'],
        ];
        foreach ($reportRoles as $reportType => $roleCodes) {
            $category = $reportType === 'annual-me' ? 'Consolidated annual report'
                : (in_array($reportType, ['data-submission', 'submission-compliance', 'outstanding-overdue', 'approval-turnaround', 'returned-corrections', 'published-register', 'data-quality'], true)
                    ? 'Submission and workflow' : 'M&E performance');
            $permissions[] = [
                'code' => 'reports.view.'.$reportType,
                'name' => ucwords(str_replace('-', ' ', $reportType)),
                'module' => 'Reports',
                'nav_item' => 'Reports — '.$category,
                'access_level' => 'View',
                'scope' => 'own',
                'description' => 'Generate and export this report within the user\'s authorised organisational scope.',
                'status' => 'active',
            ];
        }
        foreach ($permissions as $p) {
            Permission::updateOrCreate(['code' => $p['code']], $p);
        }

        $grant = fn (string $roleCode, array $codes) => Role::where('code', $roleCode)
            ->first()->permissions()->syncWithoutDetaching(
                Permission::whereIn('code', $codes)->pluck('id')
            );

        $grant('MOA', Permission::pluck('code')->all());
        $grant('PREVIEW', ['analytics.view.published']);
        $grant('IAU', ['dashboard.view', 'datasets.view', 'submissions.view.scope', 'institutions.view.own',
            'analytics.view.institution', 'audit_logs.view.institution', 'reports.view.institution']);
        $grant('MAU', ['dashboard.view', 'datasets.view.ministry', 'submissions.view.scope', 'institutions.view.ministry',
            'departments.view', 'analytics.view.ministry', 'audit_logs.view.ministry', 'reports.view.ministry']);

        $grant('ME', ['dashboard.view', 'submissions.view.approved', 'analytics.view.ministry', 'reports.view.ministry']);
        $grant('OMU', ['dashboard.view', 'submissions.view.approved', 'analytics.view.ministry', 'reports.view.ministry']);
        $grant('IM', ['dashboard.view', 'submissions.view.approved', 'analytics.view.own', 'reports.view.institution']);
        $grant('IA', [
            'reference_data.manage',
            'dashboard.view', 'submissions.view.scope',
            'datasets.configure', 'datasets.view',
            'data_consumers.configure', 'data_consumers.view',
            'submission_periods.configure', 'submission_periods.view',
            'institutions.view.own', 'users.manage.institution',
            'approval_circle.manage.institution',
            'analytics.view.institution', 'reports.view.institution',
            'audit_logs.view.institution',
        ]);
        $grant('IDO', [
            'dashboard.view', 'submissions.create', 'submissions.edit',
            'submissions.submit', 'submissions.view.scope',
            'datasets.view', 'submission_periods.view',
            'analytics.view.own', 'reports.view.own',
        ]);
        $grant('DDO', [
            'dashboard.view', 'submissions.create', 'submissions.edit',
            'submissions.submit', 'submissions.view.scope',
            'datasets.view', 'submission_periods.view',
            'analytics.view.own', 'reports.view.own',
        ]);
        $grant('IHOD', [
            'dashboard.view', 'submissions.view.scope', 'submissions.review',
            'analytics.view.own', 'reports.view.own',
        ]);
        $grant('AO', [
            'dashboard.view', 'submissions.view.scope', 'submissions.approve',
            'analytics.view.own', 'reports.view.own',
        ]);
        $grant('MDO', [
            'dashboard.view', 'submissions.view.scope', 'submissions.review', 'submissions.approve',
            'analytics.view.ministry', 'reports.view.ministry', 'institutions.view.ministry', 'departments.view',
            'datasets.view.ministry',
        ]);
        $grant('MDD', [
            'dashboard.view', 'submissions.view.scope', 'submissions.review',
            'submissions.approve', 'submissions.publish',
            'analytics.view.ministry', 'reports.view.ministry', 'datasets.view.ministry', 'institutions.view.ministry', 'departments.view',
            'datasets.view.ministry',
        ]);

        foreach ($reportRoles as $reportType => $roleCodes) {
            foreach ($roleCodes as $roleCode) {
                $grant($roleCode, ['reports.view.'.$reportType]);
            }
        }
    }
}
