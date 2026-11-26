<?php

namespace App\Models\Concerns;

use Illuminate\Database\Eloquent\Builder;

trait Filterable
{
    public function scopeFilter(Builder $q, array $filters): Builder
    {
        return $q->when($filters['status'] ?? null, fn ($w, $v) => $w->where('status', $v))
            ->when($filters['dataset_id'] ?? null, fn ($w, $v) => $w->where('dataset_id', $v))
            ->when($filters['institution_id'] ?? null, fn ($w, $v) => $w->where('institution_id', $v))
            ->when($filters['department_id'] ?? null, fn ($w, $v) => $w->where('department_id', $v))
            ->when($filters['action'] ?? null, fn ($w, $v) => $w->where('action', $v))
            ->when($filters['user_id'] ?? null, fn ($w, $v) => $w->where('user_id', $v))
            ->when($filters['module'] ?? null, fn ($w, $v) => $w->where('module', $v))
            ->when($filters['role'] ?? null, fn ($w, $v) => $w->whereHas('roles', fn ($r) => $r->where('code', $v)))
            ->when($filters['search'] ?? null, function ($w, $v) {
                $cols = property_exists($this, 'searchable') ? $this->searchable : ['name'];
                $w->where(fn ($inner) => collect($cols)->each(fn ($c) => $inner->orWhereLike($c, "%{$v}%")));
            });
    }
}
