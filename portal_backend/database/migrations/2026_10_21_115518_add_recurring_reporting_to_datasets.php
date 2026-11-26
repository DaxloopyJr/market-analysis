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
            $table->json('reporting_settings')->nullable();
        });
        Schema::table('dataset_reporting_calendars', function (Blueprint $table) {
            $table->foreignId('template_version_id')->nullable()->constrained()->restrictOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('dataset_reporting_calendars', function (Blueprint $table) {
            $table->dropConstrainedForeignId('template_version_id');
        });
        Schema::table('dataset_definitions', function (Blueprint $table) {
            $table->dropColumn('reporting_settings');
        });
    }
};
