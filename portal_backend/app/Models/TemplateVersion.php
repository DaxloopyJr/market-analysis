<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use LogicException;

class TemplateVersion extends Model
{
    public const UPDATED_AT = null;
    protected $fillable = ['dataset_definition_id', 'version_number', 'template_format', 'template_content', 'effective_from', 'created_by'];

    protected function casts(): array
    {
        return ['template_content' => 'array', 'effective_from' => 'datetime', 'version_number' => 'integer'];
    }

    protected static function booted(): void
    {
        // Matoleo yaliyotolewa hayahaririwi; mabadiliko huhifadhiwa katika toleo jipya.
        static::updating(fn () => throw new LogicException('Template version haiwezi kuhaririwa.'));
        static::deleting(fn () => throw new LogicException('Template version haiwezi kufutwa.'));
    }
}
