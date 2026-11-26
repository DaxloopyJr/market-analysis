<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('dataset_definitions', function (Blueprint $table) {
            $table->string('reporting_purpose', 40)->default('operational');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('dataset_definitions', function (Blueprint $table) {
            $table->dropColumn('reporting_purpose');
        });
    }
};
