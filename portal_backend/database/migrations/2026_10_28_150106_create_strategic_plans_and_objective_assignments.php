<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('strategic_plans', function (Blueprint $table) {
            $table->id();
            $table->foreignId('institution_id')->constrained()->restrictOnDelete();
            $table->string('name');
            $table->date('start_date');
            $table->date('end_date');
            $table->string('status', 20)->default('draft');
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamp('activated_at')->nullable();
            $table->timestamps();
            $table->index(['institution_id', 'status', 'start_date']);
        });
        Schema::create('strategic_objectives', function (Blueprint $table) {
            $table->id();
            $table->foreignId('strategic_plan_id')->constrained()->restrictOnDelete();
            $table->string('code', 40);
            $table->timestamps();
            $table->unique(['strategic_plan_id', 'code']);
        });
        Schema::create('strategic_objective_versions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('strategic_objective_id')->constrained()->restrictOnDelete();
            $table->unsignedInteger('version_number');
            $table->text('description');
            $table->date('effective_from');
            $table->text('reason')->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
            $table->unique(['strategic_objective_id', 'version_number'], 'objective_version_number_unique');
            $table->unique(['strategic_objective_id', 'effective_from'], 'objective_version_date_unique');
        });
        Schema::create('dataset_annual_objectives', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dataset_definition_id')->constrained()->restrictOnDelete();
            $table->foreignId('reporting_year_id')->constrained('reporting_periods')->restrictOnDelete();
            $table->foreignId('objective_version_id')->constrained('strategic_objective_versions')->restrictOnDelete();
            $table->json('snapshot');
            $table->timestamp('locked_at')->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
            $table->unique(['dataset_definition_id', 'reporting_year_id'], 'dataset_year_objective_unique');
        });
        foreach (['submissions', 'submission_revisions'] as $name) {
            Schema::table($name, function (Blueprint $table) {
                $table->json('objective_snapshot')->nullable();
            });
        }
    }

    public function down(): void
    {
        foreach (['submissions', 'submission_revisions'] as $name) {
            Schema::table($name, fn (Blueprint $table) => $table->dropColumn('objective_snapshot'));
        }
        Schema::dropIfExists('dataset_annual_objectives');
        Schema::dropIfExists('strategic_objective_versions');
        Schema::dropIfExists('strategic_objectives');
        Schema::dropIfExists('strategic_plans');
    }
};
