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
            $table->boolean('automatic_status')->default(true);
        });
        DB::table('reporting_periods')->whereNotNull('institution_id')->orWhere('status', 'closed')->update(['automatic_status' => false]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('reporting_periods', function (Blueprint $table) {
            $table->dropColumn('automatic_status');
        });
    }
};
