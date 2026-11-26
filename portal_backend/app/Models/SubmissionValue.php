<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SubmissionValue extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['dimension_values' => 'array', 'breakdowns' => 'array', 'value_numeric' => 'decimal:6', 'value_boolean' => 'boolean', 'value_date' => 'date'];
    }

    public function indicator(): BelongsTo
    {
        return $this->belongsTo(Indicator::class);
    }

    public function input(): array
    {
        $value = match ($this->data_type) {
            'integer' => $this->value_numeric === null ? null : explode('.', $this->value_numeric)[0],
            'decimal' => $this->value_numeric, 'boolean' => $this->value_boolean,
            'date' => $this->value_date?->toDateString(), default => $this->value_text
        };

        $input = ['indicatorId' => (int) $this->indicator_id, 'dimensionValues' => $this->dimension_values, 'value' => $value];
        if ($this->breakdowns !== null) {
            $input['breakdowns'] = $this->breakdowns;
        }
        if ($this->remarks !== null) {
            $input['remarks'] = $this->remarks;
        }

        return $input;
    }
}
