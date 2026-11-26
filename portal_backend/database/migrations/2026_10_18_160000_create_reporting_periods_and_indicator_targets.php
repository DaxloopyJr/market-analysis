<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reporting_periods', function (Blueprint $table) {
            $table->id();
            $table->foreignId('institution_id')->constrained('institutions')->restrictOnDelete();
            $table->foreignId('parent_id')->nullable()->constrained('reporting_periods')->restrictOnDelete();
            $table->enum('period_type', ['annual', 'quarterly']);
            $table->enum('year_type', ['calendar', 'financial']);
            $table->string('period_code', 40);
            $table->string('label', 80);
            $table->unsignedTinyInteger('quarter')->nullable();
            $table->date('start_date');
            $table->date('end_date');
            $table->date('deadline');
            $table->enum('status', ['open', 'closed'])->default('open');
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
            $table->unique(['institution_id', 'period_code']);
            $table->unique(['parent_id', 'quarter']);
            $table->index(['institution_id', 'status']);
        });
        Schema::create('indicator_targets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dataset_definition_id')->constrained('dataset_definitions')->restrictOnDelete();
            $table->foreignId('indicator_id')->constrained('indicators')->restrictOnDelete();
            $table->foreignId('reporting_period_id')->constrained('reporting_periods')->restrictOnDelete();
            $table->foreignId('template_version_id')->constrained('template_versions')->restrictOnDelete();
            $table->enum('target_scope', ['total', 'dimensions']);
            $table->jsonb('dimension_values');
            // Key iliyosanifishwa huzuia target kujirudia hata dimensions zikitumwa kwa mpangilio tofauti.
            $table->string('dimension_key', 64);
            $table->decimal('target_value', 24, 6);
            $table->text('notes')->nullable();
            $table->enum('status', ['active', 'inactive'])->default('active');
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
            $table->unique(['dataset_definition_id', 'indicator_id', 'reporting_period_id', 'dimension_key'], 'indicator_target_identity_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('indicator_targets');
        Schema::dropIfExists('reporting_periods');
    }
};
