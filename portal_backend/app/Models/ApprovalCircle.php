<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ApprovalCircle extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean', 'activated_at' => 'datetime'];
    }

    public function institution()
    {
        return $this->belongsTo(Institution::class);
    }

    public function steps()
    {
        return $this->hasMany(ApprovalCircleStep::class)->orderBy('sequence');
    }
}
