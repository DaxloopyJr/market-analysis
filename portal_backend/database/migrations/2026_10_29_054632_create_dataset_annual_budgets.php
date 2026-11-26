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
        Schema::create('dataset_annual_budgets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dataset_definition_id')->constrained()->restrictOnDelete();
            $table->foreignId('reporting_year_id')->constrained('reporting_periods')->restrictOnDelete();
            $table->decimal('approved_budget', 24, 2);
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
            $table->unique(['dataset_definition_id', 'reporting_year_id'], 'annual_budget_dataset_year_unique');
        });
        Schema::table('submissions', function (Blueprint $table) {
            $table->decimal('actual_received', 24, 2)->nullable();
            $table->json('annual_budget_snapshot')->nullable();
        });
        Schema::table('submission_revisions', function (Blueprint $table) {
            $table->json('performance_snapshot')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('submission_revisions', fn (Blueprint $table) => $table->dropColumn('performance_snapshot'));
        Schema::table('submissions', fn (Blueprint $table) => $table->dropColumn(['actual_received', 'annual_budget_snapshot']));
        Schema::dropIfExists('dataset_annual_budgets');
    }
};
