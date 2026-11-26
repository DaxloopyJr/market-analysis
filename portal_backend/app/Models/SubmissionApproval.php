<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SubmissionApproval extends Model
{
    protected $guarded = ['id'];

    protected $appends = ['actor'];

    public function getActorAttribute(): ?array
    {
        return $this->meta['actor'] ?? null;
    }

    protected function casts(): array
    {
        return ['meta' => 'array', 'acted_at' => 'datetime'];
    }
}
