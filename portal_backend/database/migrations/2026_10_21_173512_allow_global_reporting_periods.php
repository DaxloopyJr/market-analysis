<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('reporting_periods', function (Blueprint $table) {
            $table->unsignedBigInteger('institution_id')->nullable()->change();
        });
        // Legacy institution periods remain intact; only new global codes must be unique.
        DB::statement('CREATE UNIQUE INDEX reporting_periods_global_code_unique ON reporting_periods (period_code) WHERE institution_id IS NULL');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (DB::table('reporting_periods')->whereNull('institution_id')->exists()) {
            throw new RuntimeException('Global periods exist; restore ownership explicitly before rolling back.');
        }
        DB::statement('DROP INDEX reporting_periods_global_code_unique');
        Schema::table('reporting_periods', function (Blueprint $table) {
            $table->unsignedBigInteger('institution_id')->nullable(false)->change();
        });
    }
};
