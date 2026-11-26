<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Dataset;
use App\Models\Department;
use App\Models\Institution;
use App\Models\Submission;
use App\Models\User;
use Illuminate\Http\Request;

/** Global search - scoped: institutional users only search within their own institution. */
class SearchController extends Controller
{
    public function index(Request $request)
    {
        $q = trim($request->string('q')->toString());
        abort_if(strlen($q) < 2, 422, 'Enter at least 2 characters.');

        $user = $request->user();
        $ministry = $user->hasRole('MOA', 'MDO', 'DD') || $user->department_id !== null;
        $like = "%{$q}%";

        $submissions = Submission::query()
            ->with(['dataset:id,name', 'institution:id,name', 'department:id,name'])
            ->where(fn ($w) => $w->whereLike('reference', $like)
                ->orWhereHas('dataset', fn ($d) => $d->whereLike('name', $like)))
            ->when(! $ministry, fn ($q2) => $q2->where('institution_id', $user->institution_id))
            ->latest()->limit(8)->get()
            ->map(fn ($s) => [
                'id' => $s->id, 'label' => "{$s->reference} — {$s->dataset->name}",
                'sub' => $s->institution?->name ?? $s->department?->name ?? '', 'status' => $s->status->value,
            ]);

        $datasets = Dataset::query()->where(fn ($w) => $w->whereLike('name', $like)->orWhereLike('code', $like))
            ->when(! $ministry, fn ($q2) => $q2->where(fn ($w) => $w->where('owner_institution_id', $user->institution_id)->orWhereNull('owner_institution_id')))
            ->limit(6)->get()->map(fn ($d) => ['id' => $d->id, 'label' => ($d->code ? "{$d->code} — " : '').$d->name, 'sub' => $d->frequency, 'status' => null]);

        $users = User::query()->where(fn ($w) => $w->whereLike('name', $like)->orWhereLike('email', $like)->orWhereLike('username', $like))
            ->with('institution:id,name')
            ->when(! $ministry, fn ($q2) => $q2->where('institution_id', $user->institution_id))
            ->limit(6)->get()->map(fn ($u) => ['id' => $u->id, 'label' => $u->name, 'sub' => $u->email, 'status' => null]);

        $institutions = collect();
        $departments = collect();
        if ($ministry) {
            $institutions = Institution::where(fn ($w) => $w->whereLike('name', $like)->orWhereLike('code', $like))
                ->limit(5)->get()->map(fn ($i) => ['id' => $i->id, 'label' => $i->name, 'sub' => $i->code, 'status' => null]);
            $departments = Department::where(fn ($w) => $w->whereLike('name', $like)->orWhereLike('code', $like))
                ->limit(5)->get()->map(fn ($d) => ['id' => $d->id, 'label' => $d->name, 'sub' => $d->code, 'status' => null]);
        } elseif ($user->institution_id) {
            $institutions = Institution::where('id', $user->institution_id)
                ->where(fn ($w) => $w->whereLike('name', $like)->orWhereLike('code', $like))
                ->limit(3)->get()->map(fn ($i) => ['id' => $i->id, 'label' => $i->name, 'sub' => $i->code, 'status' => null]);
        }

        return response()->json([
            'status' => 'success',
            'data' => array_filter([
                'submissions' => $submissions->count() ? ['label' => 'Submissions', 'route' => '/submissions', 'items' => $submissions] : null,
                'datasets' => $datasets->count() ? ['label' => 'Datasets', 'route' => '/dataset-management/datasets', 'items' => $datasets] : null,
                'users' => $users->count() ? ['label' => 'Users', 'route' => '/administration/users', 'items' => $users] : null,
                'institutions' => $institutions->count() ? ['label' => 'Institutions', 'route' => '/administration/institutions', 'items' => $institutions] : null,
                'departments' => $departments->count() ? ['label' => 'Departments', 'route' => '/administration/departments', 'items' => $departments] : null,
            ]),
        ]);
    }
}
