<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Role extends Model
{
    protected $fillable = ['code', 'name', 'level', 'description', 'is_system', 'is_active', 'status'];

    protected function casts(): array
    {
        return ['is_system' => 'boolean', 'is_active' => 'boolean'];
    }

    public function permissions() { return $this->belongsToMany(Permission::class, 'permission_role'); }
    public function users()       { return $this->belongsToMany(User::class, 'user_role')->withPivot(['institution_id', 'department_id', 'effective_from', 'effective_to', 'status']); }
}
