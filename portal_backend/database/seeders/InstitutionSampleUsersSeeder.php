<?php

namespace Database\Seeders;

use App\Models\Institution;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use RuntimeException;

class InstitutionSampleUsersSeeder extends Seeder
{
    /**
     * Six separate sample accounts per existing, non-deleted institution except MIT.
     * Used by DatabaseSeeder for development/testing and available independently.
     */
    public function run(): void
    {
        if (app()->environment('production')) {
            throw new RuntimeException('Sample users seeder hairuhusiwi production.');
        }

        $accounts = [
            'ia' => ['role' => 'IA', 'name' => 'Institutional Admin'],
            'ido1' => ['role' => 'IDO', 'name' => 'Data Officer 1'],
            'ido2' => ['role' => 'IDO', 'name' => 'Data Officer 2'],
            'ihod' => ['role' => 'IHOD', 'name' => 'Head of Department'],
            'ao' => ['role' => 'AO', 'name' => 'Accounting Officer'],
            'iau' => ['role' => 'IAU', 'name' => 'Institution Auditor'],
        ];
        $roles = Role::whereIn('code', ['IA', 'IDO', 'IHOD', 'AO', 'IAU'])
            ->where('level', 'institution')->where('is_active', true)->where('status', 'active')
            ->get()->keyBy('code');
        $missing = array_diff(['IA', 'IDO', 'IHOD', 'AO', 'IAU'], $roles->keys()->all());
        if ($missing !== []) {
            throw new RuntimeException('Roles hizi lazima ziwepo na ziwe active kwanza: '.implode(', ', $missing));
        }

        $rows = DB::transaction(function () use ($accounts, $roles): array {
            $rows = [];
            $password = null;
            $institutions = Institution::where('code', '!=', 'MIT')->orderBy('id')->lockForUpdate()->get();
            foreach ($institutions as $institution) {
                foreach ($accounts as $slot => $account) {
                    // Institution ID keeps the sample identity stable even if its code/name changes.
                    // These are illustrative test addresses, not verified institutional mailboxes.
                    $email = $slot.'@'.Str::slug($institution->code).'.co.tz';
                    $username = "sample_{$slot}_inst{$institution->id}";
                    $existing = User::withTrashed()->where('username', $username)->first();
                    $legacyEmail = "sample.{$slot}.inst{$institution->id}@example.test";
                    $renameLegacy = $existing && ! $existing->trashed() && $existing->email === $legacyEmail;
                    if ((! $existing || $renameLegacy) && User::withTrashed()->whereRaw('LOWER(email) = ?', [strtolower($email)])->exists()) {
                        throw new RuntimeException("Testing email {$email} is already used by another account.");
                    }
                    $user = $existing;
                    if (! $user) {
                        $password ??= Hash::make('Password@123');
                        $user = User::create([
                            'name' => "[TEST] {$institution->code} {$account['name']}",
                            'username' => $username,
                            'email' => $email,
                            'password' => $password,
                            'institution_id' => $institution->id,
                            'department_id' => null,
                            'is_active' => true,
                            'status' => 'active',
                            'failed_attempts' => 0,
                            'locked_until' => null,
                        ]);
                    }

                    // Rename only this seeder's old placeholder; keep manually edited emails intact.
                    if ($renameLegacy) {
                        $user->email = $email;
                        $user->save();
                    }

                    // Re-running must not reset existing passwords, roles, locks or deleted accounts.
                    if ($user->wasRecentlyCreated) {
                        $user->roles()->attach($roles[$account['role']]->id, [
                            'institution_id' => $institution->id,
                            'department_id' => null,
                            'effective_from' => today()->toDateString(),
                            'effective_to' => null,
                            'status' => 'active',
                        ]);
                    }
                    $rows[] = [$institution->id, $institution->code, $account['role'], $user->email,
                        $user->wasRecentlyCreated ? 'Created' : ($renameLegacy ? 'Email updated' : 'Existing; unchanged')];
                }
            }

            return $rows;
        });

        $this->command?->table(['Institution ID', 'Institution', 'Role', 'Email', 'Result'], $rows);
        $this->command?->info('Password ya sample users wapya: Password@123. Passwords na roles zilizopo hazijabadilishwa.');
    }
}
