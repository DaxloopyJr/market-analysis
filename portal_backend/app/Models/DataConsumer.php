<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DataConsumer extends Model
{
    protected $fillable = ['name', 'normalized_name', 'short_name', 'description', 'created_by'];

    protected $hidden = ['normalized_name'];
}
