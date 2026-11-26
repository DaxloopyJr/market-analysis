<?php

namespace App\Services;

use App\DTOs\AuditEventData;
use App\Models\AuditEvent;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class AuditService
{
    public function record(AuditEventData $auditEventData): AuditEvent
    {
        // Caller husimamia transaction ili business action na audit vihifadhiwe pamoja.
        $auditEvent = new AuditEvent([
            'user_id' => $auditEventData->userId,
            'actor_type' => $auditEventData->actorType,
            'event_type' => $auditEventData->eventType,
            'entity_type' => $auditEventData->entityType,
            'entity_id' => $auditEventData->entityId,
            'ip_address' => $auditEventData->ipAddress,
            'request_id' => $auditEventData->requestId,
            'old_values' => $this->sanitizeValues($auditEventData->oldValues),
            'new_values' => $this->sanitizeValues($auditEventData->newValues),
            'reason' => $auditEventData->reason,
            'institution_id' => $this->institutionScope($auditEventData),
            'actor_snapshot' => app(ActorSnapshotService::class)->capture(
                $auditEventData->actorType === 'user' && $auditEventData->userId !== null
                    ? User::find($auditEventData->userId) : null,
                $auditEventData->actingRole,
            ),
        ]);

        $auditEvent->save();

        return $auditEvent;
    }

    /** Persist the affected institution, so later account transfers cannot move audit visibility. */
    private function institutionScope(AuditEventData $event): ?int
    {
        $db = DB::class;
        $id = $event->entityId;
        if ($id !== null && ! ctype_digit($id)) {
            return null;
        }
        $direct = ['institutions' => 'institutions', 'institution' => 'institutions',
            'users' => 'users', 'user' => 'users', 'dataset_definition' => 'dataset_definitions',
            'approval_circle' => 'approval_circles', 'strategic_plan' => 'strategic_plans'];
        if ($id !== null && isset($direct[$event->entityType ?? ''])) {
            $table = $direct[$event->entityType];
            $value = $db::table($table)->where('id', $id)->value($table === 'institutions' ? 'id' : 'institution_id');

            return $value === null ? null : (int) $value;
        }
        if ($event->entityType === 'strategic_objective' && $id !== null) {
            $owner = DB::table('strategic_objectives')->join('strategic_plans', 'strategic_plans.id', '=', 'strategic_objectives.strategic_plan_id')
                ->where('strategic_objectives.id', $id)->value('strategic_plans.institution_id');

            return $owner === null ? null : (int) $owner;
        }
        $children = ['dataset_annual_objective' => 'dataset_annual_objectives', 'dataset_annual_target' => 'dataset_annual_targets', 'indicator_target' => 'indicator_targets',
            'dataset_dimension' => 'dataset_dimensions', 'dataset_indicator' => 'dataset_indicators',
            'template_version' => 'template_versions', 'dataset_reporting_calendar' => 'dataset_reporting_calendars'];
        $datasetId = null;
        if ($id !== null && isset($children[$event->entityType ?? ''])) {
            $datasetId = $db::table($children[$event->entityType])->where('id', $id)->value('dataset_definition_id');
        } elseif ($event->entityType === 'submission' && $id !== null) {
            $datasetId = $db::table('submissions')->join('dataset_reporting_calendars', 'dataset_reporting_calendars.id', '=', 'submissions.reporting_calendar_id')
                ->where('submissions.id', $id)->value('dataset_definition_id');
        } elseif ($event->entityType === null && $event->userId !== null) {
            return User::find($event->userId)?->institution_id;
        }
        $value = $datasetId === null ? null : $db::table('dataset_definitions')->where('id', $datasetId)->value('institution_id');

        // Unknown/legacy/global scope stays ministry-only instead of guessing a tenant.
        return $value === null ? null : (int) $value;
    }

    /** Huondoa credential fields zinazojulikana, hata ndani ya arrays zilizopachikwa. */
    private function sanitizeValues(?array $values): ?array
    {
        if ($values === null) {
            return null;
        }

        $sensitiveKeys = [
            'password', 'passwordconfirmation', 'currentpassword', 'oldpassword',
            'newpassword', 'passwordhash', 'token', 'accesstoken', 'refreshtoken',
            'remembertoken', 'apitoken', 'csrftoken', 'authorization', 'cookie',
            'setcookie', 'secret', 'clientsecret', 'apikey', 'privatekey',
            'twofactorsecret', 'twofactorrecoverycodes', 'recoverycodes', 'otp',
        ];

        foreach ($values as $fieldName => $fieldValue) {
            $normalizedName = strtolower(str_replace(['_', '-'], '', (string) $fieldName));

            if (in_array($normalizedName, $sensitiveKeys, true)) {
                unset($values[$fieldName]);
            } elseif (is_array($fieldValue)) {
                $values[$fieldName] = $this->sanitizeValues($fieldValue);
            } elseif (is_object($fieldValue)) {
                // Objects zisizodhibitiwa zinaweza kufichua credentials wakati wa serialization.
                unset($values[$fieldName]);
            }
        }

        return $values;
    }
}
