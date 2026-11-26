<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasOne;

class DatasetReportingCalendar extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['deadline' => 'date', 'reminder_days' => 'array', 'submitted_at' => 'datetime', 'reminders_enabled' => 'boolean'];
    }

    public function dataset()
    {
        return $this->belongsTo(DatasetDefinition::class, 'dataset_definition_id');
    }

    public function period()
    {
        return $this->belongsTo(ReportingPeriod::class, 'reporting_period_id');
    }

    public function responsibleUser()
    {
        return $this->belongsTo(User::class, 'responsible_user_id');
    }

    public function submission(): HasOne
    {
        return $this->hasOne(Submission::class, 'reporting_calendar_id');
    }
}
