<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\Storage;

class Institution extends Model
{
    use SoftDeletes;

    protected $appends = ['profile_image_url'];

    public function getProfileImageUrlAttribute(): ?string
    {
        return $this->profile_image_path ? Storage::disk('public')->url($this->profile_image_path) : null;
    }

    protected $fillable = ['name', 'code', 'short_name', 'type', 'description', 'is_active', 'status'];

    public function users()
    {
        return $this->hasMany(User::class);
    }

    public function submissions()
    {
        return $this->hasMany(Submission::class);
    }

    public function approvalCircle()
    {
        return $this->hasOne(ApprovalCircle::class)->where('is_active', true);
    }
}
