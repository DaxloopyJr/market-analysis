<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Department extends Model
{
    use SoftDeletes;

    protected $fillable = ['name', 'code', 'parent_department_id', 'description', 'is_active', 'status'];

    public function users()       { return $this->hasMany(User::class); }
    public function parent()      { return $this->belongsTo(Department::class, 'parent_department_id'); }
    public function children()    { return $this->hasMany(Department::class, 'parent_department_id'); }
    public function submissions() { return $this->hasMany(Submission::class); }
}
