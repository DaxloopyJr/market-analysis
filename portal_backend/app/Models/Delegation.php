<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Delegation extends Model
{
    protected $fillable = [
        'delegator_user_id', 'delegate_user_id', 'role_id', 'department_id',
        'effective_from', 'effective_to', 'status',
    ];

    protected function casts(): array
    {
        return ['effective_from' => 'date', 'effective_to' => 'date'];
    }

    public function delegator() { return $this->belongsTo(User::class, 'delegator_user_id'); }
    public function delegate()  { return $this->belongsTo(User::class, 'delegate_user_id'); }
    public function role()      { return $this->belongsTo(Role::class); }
    public function department(){ return $this->belongsTo(Department::class); }
}
