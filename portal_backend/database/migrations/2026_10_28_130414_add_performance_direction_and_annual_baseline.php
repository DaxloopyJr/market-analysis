<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('indicators', 'performance_direction')) {
            Schema::table('indicators', function (Blueprint $table) {
                $table->string('performance_direction')->default('higher_is_better');
            });
        } else {
            // Reconcile databases that already received the M&E branch's short column.
            Schema::table('indicators', function (Blueprint $table) {
                $table->string('performance_direction')->default('higher_is_better')->change();
            });
            DB::table('indicators')->where('performance_direction', 'higher')->update(['performance_direction' => 'higher_is_better']);
            DB::table('indicators')->where('performance_direction', 'lower')->update(['performance_direction' => 'lower_is_better']);
        }
        Schema::table('dataset_annual_targets', function (Blueprint $table) {
            $table->string('baseline_value', 26)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('dataset_annual_targets', function (Blueprint $table) {
            $table->dropColumn('baseline_value');
        });
        Schema::table('indicators', function (Blueprint $table) {
            $table->dropColumn('performance_direction');
        });
    }
};
