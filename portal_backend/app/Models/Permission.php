<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Permission extends Model
{
    protected $fillable = ['code', 'name', 'module', 'nav_item', 'access_level', 'scope', 'description', 'status'];

    public function roles() { return $this->belongsToMany(Role::class, 'permission_role'); }
}
