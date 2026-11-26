<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DatasetDefinition extends Model
{
    protected $fillable = [
        'institution_id', 'department_id', 'dataset_code', 'dataset_name',
        'description', 'status', 'created_by', 'responsible_user_id', 'creator_snapshot',
        'collection_method', 'source_system_name', 'source_description', 'reporting_settings',
    ];

    protected $attributes = ['status' => 'draft', 'reporting_purpose' => 'operational'];

    protected function casts(): array
    {
        return ['priority_updated_at' => 'datetime', 'reporting_settings' => 'array', 'creator_snapshot' => 'array'];
    }

    public function consumers(): BelongsToMany
    {
        return $this->belongsToMany(DataConsumer::class, 'dataset_consumers')->withTimestamps();
    }

    public function sectors(): BelongsToMany
    {
        return $this->belongsToMany(ReferenceDataValue::class, 'dataset_sectors', 'dataset_definition_id', 'sector_id');
    }

    public function subsectors(): BelongsToMany
    {
        return $this->belongsToMany(ReferenceDataValue::class, 'dataset_subsectors', 'dataset_definition_id', 'subsector_id');
    }

    public function dimensions(): BelongsToMany
    {
        return $this->belongsToMany(DimensionDefinition::class, 'dataset_dimensions', 'dataset_definition_id', 'dimension_id')
            ->withPivot(['id', 'is_required', 'display_order'])->withTimestamps();
    }

    public function templateVersions(): HasMany
    {
        return $this->hasMany(TemplateVersion::class);
    }

    public function indicators(): BelongsToMany
    {
        return $this->belongsToMany(Indicator::class, 'dataset_indicators')
            ->withPivot(['id', 'is_required', 'display_order'])->withTimestamps();
    }

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function frequencies(): HasMany
    {
        return $this->hasMany(DatasetFrequency::class);
    }
}
