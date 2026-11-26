<?php

use App\Http\Controllers\Api\V1\AdministrationController;
use App\Http\Controllers\Api\V1\AuditEventController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\DashboardController;
use App\Http\Controllers\Api\V1\DatasetAnalyticsController;
use App\Http\Controllers\Api\V1\DatasetConfigurationController;
use App\Http\Controllers\Api\V1\DatasetController;
use App\Http\Controllers\Api\V1\DatasetIndicatorController;
use App\Http\Controllers\Api\V1\DatasetPlanningController;
use App\Http\Controllers\Api\V1\DatasetReportingController;
use App\Http\Controllers\Api\V1\DimensionController;
use App\Http\Controllers\Api\V1\IndicatorController;
use App\Http\Controllers\Api\V1\IndicatorTargetController;
use App\Http\Controllers\Api\V1\NotificationController;
use App\Http\Controllers\Api\V1\PortalSettingController;
use App\Http\Controllers\Api\V1\ReferenceDataController;
use App\Http\Controllers\Api\V1\ReportController;
use App\Http\Controllers\Api\V1\ReportingPeriodController;
use App\Http\Controllers\Api\V1\SearchController;
use App\Http\Controllers\Api\V1\StrategicPlanController;
use App\Http\Controllers\Api\V1\SubmissionController;
use App\Http\Controllers\Api\V1\SystemMonitoringController;
use App\Http\Controllers\Api\V1\WorkflowConfigurationController;
use Illuminate\Support\Facades\Route;

Route::get('/health', function () {
    return response()->json([
        'status' => 'success',
        'application' => 'Viwanda Portal',
        'message' => 'Laravel API is working',
    ]);
});

// API ya version 1 hutumia prefix /api/v1; /api/health imehifadhiwa kwa compatibility.

Route::prefix('v1')->group(function () {

    Route::get('/health', function () {
        return response()->json([
            'status' => 'success',
            'application' => 'Viwanda Portal',
            'message' => 'Laravel API is working',
        ]);
    });

    /* ---------- Auth (public) ---------- */
    Route::post('login', [AuthController::class, 'login']);
    Route::post('mfa/login/verify', [AuthController::class, 'verifyMfa']);
    Route::post('mfa/login/resend', [AuthController::class, 'resendMfa']);
    Route::post('forgot-password/lookup', [AuthController::class, 'resetDestinationLookup']);
    Route::post('forgot-password', [AuthController::class, 'forgotPassword']);
    Route::post('activate', [AuthController::class, 'activate']);
    Route::post('reset-password', [AuthController::class, 'resetPassword']);
    Route::get('portal-settings/public', [PortalSettingController::class, 'publicIndex']);

    /* ---------- Authenticated ---------- */
    Route::middleware('auth:sanctum')->group(function () {
        Route::get('admin/dashboard', [SystemMonitoringController::class, 'index'])
            ->middleware('throttle:30,1')->name('monitoring.dashboard');
        Route::get('me', [AuthController::class, 'me']);
        Route::post('logout', [AuthController::class, 'logout']);
        Route::post('change-password', [AuthController::class, 'changePassword']);
        Route::put('profile', [AuthController::class, 'updateProfile']);
        Route::put('profile/mfa', [AuthController::class, 'updateMfa']);
        Route::get('search', [SearchController::class, 'index']);

        /* Dashboard */
        Route::get('dashboard', [DashboardController::class, 'index'])->middleware('permission:dashboard.view');

        // Analytics has its own read scope; Preview never grants access to draft submissions.
        Route::get('analytics/organisations', [DatasetAnalyticsController::class, 'organisations']);
        Route::get('analytics/datasets', [DatasetAnalyticsController::class, 'datasets']);
        Route::get('analytics/datasets/{dataset}/options', [DatasetAnalyticsController::class, 'options'])->whereNumber('dataset');
        Route::get('analytics/datasets/{dataset}/trends', [DatasetAnalyticsController::class, 'trends'])->whereNumber('dataset');
        Route::get('analytics/datasets/{dataset}/comparison', [DatasetAnalyticsController::class, 'comparison'])->whereNumber('dataset');
        Route::get('analytics/datasets/{dataset}', [DatasetAnalyticsController::class, 'show'])->whereNumber('dataset');

        // Strategic plans are scoped to an institution; MIT owns the plan shared by its departments.
        Route::get('strategic-plans', [StrategicPlanController::class, 'index']);
        Route::post('strategic-plans', [StrategicPlanController::class, 'store']);
        Route::get('strategic-plans/{id}', [StrategicPlanController::class, 'show'])->whereNumber('id');
        Route::patch('strategic-plans/{id}', [StrategicPlanController::class, 'update'])->whereNumber('id');
        Route::patch('strategic-plans/{id}/objectives/{objective}', [StrategicPlanController::class, 'updateObjective'])->whereNumber(['id', 'objective']);
        Route::post('strategic-plans/{id}/activate', [StrategicPlanController::class, 'activate'])->whereNumber('id');
        Route::post('strategic-plans/{id}/objectives', [StrategicPlanController::class, 'storeObjective'])->whereNumber('id');
        Route::post('strategic-plans/{id}/objectives/{objective}/versions', [StrategicPlanController::class, 'storeVersion'])->whereNumber(['id', 'objective']);

        /* Administration */
        Route::post('institutions/{institution}/profile-image', [AdministrationController::class, 'institutionProfileImage']);
        Route::middleware('permission:institutions.manage,institutions.view.own,institutions.view.ministry')->get('institutions', [AdministrationController::class, 'institutions']);
        Route::middleware('permission:institutions.manage')->post('institutions', [AdministrationController::class, 'storeInstitution']);
        Route::middleware('permission:institutions.manage')->put('institutions/{institution}', [AdministrationController::class, 'updateInstitution']);
        Route::middleware('permission:departments.manage,departments.view')->get('departments', [AdministrationController::class, 'departments']);
        Route::middleware('permission:departments.manage')->post('departments', [AdministrationController::class, 'storeDepartment']);
        Route::middleware('permission:departments.manage')->put('departments/{department}', [AdministrationController::class, 'updateDepartment']);
        Route::middleware('permission:users.manage.ministry,users.manage.institution')->get('users', [AdministrationController::class, 'users']);
        Route::middleware('permission:users.manage.ministry,users.manage.institution')->get('users/{id}', [AdministrationController::class, 'Singleuser']);
        Route::middleware('permission:users.manage.ministry,users.manage.institution')->post('users', [AdministrationController::class, 'storeUser']);
        Route::middleware('permission:users.manage.ministry,users.manage.institution')->put('users/{user}', [AdministrationController::class, 'updateUser']);
        Route::middleware('permission:users.manage.ministry,users.manage.institution')->post('users/{user}/unlock', [AdministrationController::class, 'unlockUser']);
        Route::middleware('permission:users.manage.ministry,users.manage.institution')->post('users/{user}/send-reset-link', [AdministrationController::class, 'sendResetLink']);
        Route::middleware('permission:roles.manage')->get('roles', [AdministrationController::class, 'roles']);
        Route::middleware('permission:roles.manage')->post('roles', [AdministrationController::class, 'storeRole']);
        Route::middleware('permission:roles.manage')->put('roles/{role}', [AdministrationController::class, 'updateRole']);
        Route::middleware('permission:roles.manage')->get('permissions', [AdministrationController::class, 'permissions']);
        Route::middleware('permission:portal_settings.manage')->get('portal-settings', [PortalSettingController::class, 'index']);
        Route::middleware('permission:portal_settings.manage')->put('portal-settings', [PortalSettingController::class, 'update']);
        Route::middleware('permission:approval_circle.manage.ministry,approval_circle.manage.institution')->get('approval-circles', [WorkflowConfigurationController::class, 'index']);
        Route::middleware('permission:approval_circle.manage.ministry,approval_circle.manage.institution')->post('approval-circles', [WorkflowConfigurationController::class, 'store']);
        Route::middleware('permission:approval_circle.manage.ministry,approval_circle.manage.institution')->put('approval-circle-steps/{step}', [WorkflowConfigurationController::class, 'updateStep']);
        Route::middleware('permission:roles.manage')->get('delegations', [AdministrationController::class, 'delegations']);
        Route::middleware('permission:roles.manage')->post('delegations', [AdministrationController::class, 'storeDelegation']);
        Route::middleware('permission:roles.manage')->post('delegations/{delegation}/revoke', [AdministrationController::class, 'revokeDelegation']);

    });

    // Gate ya audit.readAll hukagua ruhusa ya kusoma audit zote kupitia RBAC MOA anaruhusiwa.
    Route::group(['prefix' => 'audit-events', 'middleware' => ['auth:sanctum', 'can:audit.read']], function () {
        Route::get('/', [AuditEventController::class, 'index']);
        Route::get('/{id}', [AuditEventController::class, 'show'])->whereNumber('id');
    });

    Route::group(['prefix' => 'notifications', 'middleware' => ['auth:sanctum']], function () {
        // Kila mtumiaji husoma na kuweka alama kwenye notifications zake pekee.
        Route::get('/', [NotificationController::class, 'index']);
        Route::get('/unread-count', [NotificationController::class, 'unreadCount']);
        Route::get('/{id}', [NotificationController::class, 'show'])->whereNumber('id');
        Route::patch('/{id}/read', [NotificationController::class, 'markRead'])->whereNumber('id');

    });

    // Reference data husomwa na watumiaji walioingia; uhariri hukaguliwa kwenye controller.
    Route::prefix('reference-data')->middleware('auth:sanctum')->group(function () {
        Route::patch('/{id}', [ReferenceDataController::class, 'update'])->whereNumber('id');
        Route::delete('/{id}', [ReferenceDataController::class, 'destroy'])->whereNumber('id');
        Route::patch('/{id}/values/{valueId}', [ReferenceDataController::class, 'updateValue'])->whereNumber(['id', 'valueId']);
        Route::delete('/{id}/values/{valueId}', [ReferenceDataController::class, 'destroyValue'])->whereNumber(['id', 'valueId']);
        Route::get('/', [ReferenceDataController::class, 'index']);
        Route::post('/', [ReferenceDataController::class, 'store']);
        Route::get('/{id}', [ReferenceDataController::class, 'show'])->whereNumber('id');
        Route::get('/{id}/values', [ReferenceDataController::class, 'values'])->whereNumber('id');
        Route::post('/{id}/values', [ReferenceDataController::class, 'storeValue'])->whereNumber('id');
        Route::get('/{id}/values/{valueId}', [ReferenceDataController::class, 'showValue'])->whereNumber(['id', 'valueId']);
    });

    // Dataset definitions zinalindwa na token pamoja na scope ya role kwenye controller.
    Route::get('data-consumers', [DatasetPlanningController::class, 'consumers'])->middleware('auth:sanctum');
    Route::prefix('datasets')->middleware('auth:sanctum')->group(function () {
        Route::get('/eligible-officers', [DatasetController::class, 'eligibleOfficers']);
        Route::get('/{datasetId}/reporting-settings', [DatasetReportingController::class, 'showSettings'])->whereNumber('datasetId');
        Route::put('/{datasetId}/reporting-settings', [DatasetReportingController::class, 'saveSettings'])->whereNumber('datasetId');
        Route::get('/{datasetId}/assignees', [DatasetPlanningController::class, 'assignees'])->whereNumber('datasetId');
        Route::post('/{datasetId}/reporting-years', [DatasetReportingController::class, 'year'])->whereNumber('datasetId');
        Route::post('/{datasetId}/submission-context', [DatasetReportingController::class, 'context'])->whereNumber('datasetId');
        Route::get('/{datasetId}/submission-status', [DatasetReportingController::class, 'selectionStatus'])->whereNumber('datasetId');
        Route::get('/{datasetId}/reporting-calendar', [DatasetPlanningController::class, 'calendars'])->whereNumber('datasetId');
        Route::put('/{datasetId}/reporting-calendar', [DatasetPlanningController::class, 'saveCalendar'])->whereNumber('datasetId');
        Route::patch('/{datasetId}/priority', [DatasetPlanningController::class, 'priority'])->whereNumber('datasetId');
        Route::get('/{datasetId}/targets', [IndicatorTargetController::class, 'index'])->whereNumber('datasetId');
        Route::post('/{datasetId}/targets', [IndicatorTargetController::class, 'store'])->whereNumber('datasetId');
        Route::get('/{datasetId}/targets/{targetId}', [IndicatorTargetController::class, 'show'])->whereNumber(['datasetId', 'targetId']);
        Route::patch('/{datasetId}/targets/{targetId}', [IndicatorTargetController::class, 'update'])->whereNumber(['datasetId', 'targetId']);
        Route::delete('/{datasetId}/targets/{targetId}', [IndicatorTargetController::class, 'destroy'])->whereNumber(['datasetId', 'targetId']);
        // Configuration na matoleo hutumia scope ileile ya dataset.
        Route::get('/{datasetId}/configuration-progress', [DatasetConfigurationController::class, 'progress'])->whereNumber('datasetId');
        Route::get('/{datasetId}/sectors', [DatasetConfigurationController::class, 'sectors'])->whereNumber('datasetId');
        Route::patch('/{datasetId}/sectors', [DatasetConfigurationController::class, 'updateSectors'])->whereNumber('datasetId');
        Route::get('/{datasetId}/dimensions', [DatasetConfigurationController::class, 'dimensions'])->whereNumber('datasetId');
        Route::post('/{datasetId}/dimensions', [DatasetConfigurationController::class, 'addDimension'])->whereNumber('datasetId');
        Route::patch('/{datasetId}/dimensions/{dimensionId}', [DatasetConfigurationController::class, 'updateDimension'])->whereNumber(['datasetId', 'dimensionId']);
        Route::delete('/{datasetId}/dimensions/{dimensionId}', [DatasetConfigurationController::class, 'removeDimension'])->whereNumber(['datasetId', 'dimensionId']);
        Route::post('/{datasetId}/activate', [DatasetConfigurationController::class, 'activate'])->whereNumber('datasetId');
        Route::post('/{datasetId}/draft', [DatasetConfigurationController::class, 'reopen'])->whereNumber('datasetId');
        Route::get('/{datasetId}/template-versions', [DatasetConfigurationController::class, 'versions'])->whereNumber('datasetId');
        Route::get('/{datasetId}/template-versions/{versionId}', [DatasetConfigurationController::class, 'version'])->whereNumber(['datasetId', 'versionId']);
        Route::get('/{datasetId}/indicators', [DatasetIndicatorController::class, 'index'])->whereNumber('datasetId');
        Route::post('/{datasetId}/indicators', [DatasetIndicatorController::class, 'store'])->whereNumber('datasetId');
        Route::patch('/{datasetId}/indicators/{indicatorId}', [DatasetIndicatorController::class, 'update'])->whereNumber(['datasetId', 'indicatorId']);
        Route::delete('/{datasetId}/indicators/{indicatorId}', [DatasetIndicatorController::class, 'destroy'])->whereNumber(['datasetId', 'indicatorId']);
        Route::get('/', [DatasetController::class, 'index']);
        Route::post('/', [DatasetController::class, 'store']);
        Route::get('/{id}', [DatasetController::class, 'show'])->whereNumber('id');
        Route::patch('/{id}', [DatasetController::class, 'update'])->whereNumber('id');
        Route::delete('/{id}', [DatasetController::class, 'destroy'])->whereNumber('id');
    });

    // Catalogue ya indicators inalindwa na authentication na ukaguzi wa creator kwenye uhariri.
    Route::prefix('indicators')->middleware('auth:sanctum')->group(function () {
        Route::get('/', [IndicatorController::class, 'index']);
        Route::post('/', [IndicatorController::class, 'store']);
        Route::get('/{id}', [IndicatorController::class, 'show'])->whereNumber('id');
        Route::patch('/{id}', [IndicatorController::class, 'update'])->whereNumber('id');
        Route::delete('/{id}', [IndicatorController::class, 'destroy'])->whereNumber('id');
    });

    Route::prefix('dimensions')->middleware('auth:sanctum')->group(function () {
        Route::get('/', [DimensionController::class, 'index']);
        Route::get('/{id}', [DimensionController::class, 'show'])->whereNumber('id');
        Route::patch('/{id}', [DimensionController::class, 'update'])->whereNumber('id');
        Route::delete('/{id}', [DimensionController::class, 'destroy'])->whereNumber('id');
    });

    Route::prefix('approval-circles')->middleware('auth:sanctum')->group(function () {
        Route::get('/{id}', [WorkflowConfigurationController::class, 'show'])->whereNumber('id');
        Route::put('/{id}', [WorkflowConfigurationController::class, 'update'])->whereNumber('id');
        Route::post('/{id}/activate', [WorkflowConfigurationController::class, 'activate'])->whereNumber('id');
        Route::post('/{id}/clone', [WorkflowConfigurationController::class, 'clone'])->whereNumber('id');
    });

    Route::prefix('reports')->middleware('auth:sanctum')->group(function () {
        Route::get('/executive-overview', [ReportController::class, 'executiveOverview']);
        Route::get('/catalog', [ReportController::class, 'catalog']);
        Route::get('/filters', [ReportController::class, 'filters']);
        Route::get('/metadata/indicators', [ReportController::class, 'indicatorMetadata']);
        Route::put('/metadata/indicators/{id}', [ReportController::class, 'updateIndicatorMetadata'])->whereNumber('id');
        Route::get('/{type}', [ReportController::class, 'show'])
            ->whereIn('type', array_keys(ReportController::REPORTS));
    });

    Route::prefix('submissions')->middleware('auth:sanctum')->group(function () {
        Route::patch('/{id}/annual-targets', [SubmissionController::class, 'correctAnnualTargets'])->whereNumber('id');
        Route::get('/', [SubmissionController::class, 'index']);
        Route::post('/', [SubmissionController::class, 'store']);
        Route::get('/{id}', [SubmissionController::class, 'show'])->whereNumber('id');
        Route::get('/{id}/template-archives', [SubmissionController::class, 'templateArchives'])->whereNumber('id');
        Route::put('/{id}/values', [SubmissionController::class, 'values'])->whereNumber('id');
        Route::patch('/{id}/values', [SubmissionController::class, 'correctValues'])->whereNumber('id');
        Route::post('/{id}/submit', [SubmissionController::class, 'submit'])->whereNumber('id');
        Route::post('/{id}/{action}', [SubmissionController::class, 'action'])->whereNumber('id')->whereIn('action', ['review', 'approve', 'return', 'publish']);
    });

    Route::prefix('reporting-periods')->middleware('auth:sanctum')->group(function () {
        Route::post('/{id}/quarters', [ReportingPeriodController::class, 'generateQuarters'])->whereNumber('id');
        Route::post('/{id}/months', [ReportingPeriodController::class, 'generateMonths'])->whereNumber('id');
        Route::post('/{id}/semiannual', [ReportingPeriodController::class, 'generateSemiannual'])->whereNumber('id');
        Route::post('/{id}/weeks', [ReportingPeriodController::class, 'generateWeeks'])->whereNumber('id');
        Route::post('/{id}/days', [ReportingPeriodController::class, 'generateDays'])->whereNumber('id');
        Route::get('/', [ReportingPeriodController::class, 'index']);
        Route::post('/', [ReportingPeriodController::class, 'store']);
        Route::get('/{id}', [ReportingPeriodController::class, 'show'])->whereNumber('id');
        Route::patch('/{id}', [ReportingPeriodController::class, 'update'])->whereNumber('id');
        Route::delete('/{id}', [ReportingPeriodController::class, 'destroy'])->whereNumber('id');
    });

});
