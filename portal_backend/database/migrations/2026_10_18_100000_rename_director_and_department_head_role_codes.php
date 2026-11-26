<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $this->renameRoles([
            ['DD', 'MDD', 'Ministry Department Director'],
            ['HoD', 'IHOD', 'Institutional Head of Department'],
        ]);
    }

    public function down(): void
    {
        $this->renameRoles([
            ['MDD', 'DD', 'Department Director'],
            ['IHOD', 'HoD', 'Head of Department'],
        ]);
    }

    private function renameRoles(array $mappings): void
    {
        DB::transaction(function () use ($mappings): void {
            foreach ($mappings as [$oldCode, $newCode, $name]) {
                $role = DB::table('roles')->where('code', $oldCode)->first();
                if ($role === null) {
                    continue;
                }

                // Roles mbili zilizopo hazijaunganishwi kimyakimya ili kulinda assignments zake.
                if (DB::table('roles')->where('code', $newCode)->exists()) {
                    throw new RuntimeException("Roles {$oldCode} na {$newCode} zote zipo; kagua assignments kabla ya kuziunganisha.");
                }

                // ID hubaki ileile ili user_role, permission_role na delegations zihifadhi mahusiano.
                DB::table('roles')->where('id', $role->id)->update([
                    'code' => $newCode,
                    'name' => $name,
                    'updated_at' => now(),
                ]);
            }
        });
    }
};
