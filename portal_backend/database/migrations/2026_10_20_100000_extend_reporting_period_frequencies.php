<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // PostgreSQL enum ya Laravel ni CHECK; ongeza frequencies bila kufuta rekodi.
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE reporting_periods DROP CONSTRAINT IF EXISTS reporting_periods_period_type_check');
        }
        Schema::table('reporting_periods', function (Blueprint $table) {
            $table->string('period_type')->change();
            $table->unsignedSmallInteger('period_number')->nullable();
            $table->unique(['parent_id', 'period_type', 'period_number'], 'reporting_period_number_unique');
        });
        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE reporting_periods ADD CONSTRAINT reporting_periods_period_type_check CHECK (period_type IN ('annual','quarterly','monthly','semiannual','weekly','daily'))");
        }
    }

    public function down(): void
    {
        // Schema ya zamani haiwezi kubeba periods mpya; rollback hairuhusiwi kupoteza data.
        if (DB::table('reporting_periods')->whereNotIn('period_type', ['annual', 'quarterly'])->exists()) {
            throw new RuntimeException('Periods mpya zipo; rollback haiwezi kufuta maana yake.');
        }
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE reporting_periods DROP CONSTRAINT IF EXISTS reporting_periods_period_type_check');
        }
        Schema::table('reporting_periods', function (Blueprint $table) {
            $table->dropUnique('reporting_period_number_unique');
            $table->dropColumn('period_number');
            $table->enum('period_type', ['annual', 'quarterly'])->change();
        });
    }
};
