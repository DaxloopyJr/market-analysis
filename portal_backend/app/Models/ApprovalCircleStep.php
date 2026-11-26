<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ApprovalCircleStep extends Model
{
    protected $fillable = ['approval_circle_id', 'sequence', 'step_name', 'required_role_code', 'assigned_user_id', 'action', 'level', 'can_return'];

    protected function casts(): array
    {
        return ['can_return' => 'boolean', 'sequence' => 'integer', 'assigned_user_id' => 'integer'];
    }

    public function circle()
    {
        return $this->belongsTo(ApprovalCircle::class, 'approval_circle_id');
    }

    public function assignedUser()
    {
        return $this->belongsTo(User::class, 'assigned_user_id');
    }
}
