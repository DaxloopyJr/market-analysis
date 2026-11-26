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
        Schema::create('submission_template_archives', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dataset_definition_id')->constrained()->restrictOnDelete();
            $table->foreignId('reporting_period_id')->constrained()->restrictOnDelete();
            $table->foreignId('submission_id')->nullable()->constrained()->restrictOnDelete();
            $table->foreignId('from_template_version_id')->nullable()->constrained('template_versions')->restrictOnDelete();
            $table->foreignId('to_template_version_id')->constrained('template_versions')->restrictOnDelete();
            $table->foreignId('archived_by')->constrained('users')->restrictOnDelete();
            $table->json('snapshot');
            $table->string('reason');
            $table->timestamps();
            $table->unique(['dataset_definition_id', 'reporting_period_id', 'to_template_version_id'], 'period_template_archive_unique');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('submission_template_archives');
    }
};
