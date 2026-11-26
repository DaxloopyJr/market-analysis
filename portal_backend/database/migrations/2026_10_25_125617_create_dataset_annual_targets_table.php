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
        Schema::create('dataset_annual_targets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dataset_definition_id')->constrained()->restrictOnDelete();
            $table->foreignId('reporting_year_id')->constrained('reporting_periods')->restrictOnDelete();
            $table->foreignId('indicator_id')->constrained()->restrictOnDelete();
            $table->foreignId('template_version_id')->constrained()->restrictOnDelete();
            $table->string('target_value', 26);
            $table->string('data_type', 20);
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->unique(['dataset_definition_id', 'reporting_year_id', 'indicator_id'], 'annual_target_unique');
            $table->timestamps();
        });
        Schema::table('submissions', function (Blueprint $table) {
            $table->json('annual_targets_snapshot')->nullable();
        });
        Schema::table('submission_revisions', function (Blueprint $table) {
            $table->json('annual_targets_snapshot')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('dataset_annual_targets');
        Schema::table('submissions', function (Blueprint $table) {
            $table->dropColumn('annual_targets_snapshot');
        });
        Schema::table('submission_revisions', function (Blueprint $table) {
            $table->dropColumn('annual_targets_snapshot');
        });
    }
};
