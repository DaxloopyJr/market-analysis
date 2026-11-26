<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Submission extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['approved_budget' => 'decimal:2', 'actual_received' => 'decimal:2', 'actual_expenditure' => 'decimal:2', 'annual_budget_snapshot' => 'array', 'objective_snapshot' => 'array', 'annual_targets_snapshot' => 'array', 'submitted_at' => 'datetime', 'published_at' => 'datetime', 'correction_deadline' => 'date', 'revision' => 'integer', 'attempt' => 'integer', 'current_step' => 'integer'];
    }

    public function calendar()
    {
        return $this->belongsTo(DatasetReportingCalendar::class, 'reporting_calendar_id');
    }

    public function template()
    {
        return $this->belongsTo(TemplateVersion::class, 'template_version_id');
    }

    public function circle()
    {
        return $this->belongsTo(ApprovalCircle::class, 'approval_circle_id');
    }

    public function ministryCircle(): BelongsTo
    {
        return $this->belongsTo(ApprovalCircle::class, 'ministry_approval_circle_id');
    }

    public function currentCircle(): ?ApprovalCircle
    {
        return $this->workflow_stage === 'ministry' ? $this->ministryCircle : $this->circle;
    }

    public function values()
    {
        return $this->hasMany(SubmissionValue::class)->orderBy('indicator_id')->orderBy('dimension_key');
    }

    public function approvals()
    {
        return $this->hasMany(SubmissionApproval::class)->orderBy('id');
    }

    public function latestSubmittedApproval(): HasOne
    {
        return $this->hasOne(SubmissionApproval::class)->ofMany(
            ['id' => 'max'],
            fn ($query) => $query->where('action', 'submitted'),
        );
    }

    public function currentStep(): ?ApprovalCircleStep
    {
        return $this->currentCircle()?->steps()->where('sequence', $this->current_step)->first();
    }
}
