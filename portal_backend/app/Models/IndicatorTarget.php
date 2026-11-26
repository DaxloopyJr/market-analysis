<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class IndicatorTarget extends Model
{
    protected $guarded = ['id'];
    public function datasetDefinition(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(DatasetDefinition::class);
    }
    public function indicator(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(Indicator::class);
    }
    protected function casts(): array
    {
        return ['dimension_values' => 'array', 'target_value' => 'decimal:6'];
    }
    public function period(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(ReportingPeriod::class, 'reporting_period_id');
    }
    public function templateVersion(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(TemplateVersion::class);
    }
}
