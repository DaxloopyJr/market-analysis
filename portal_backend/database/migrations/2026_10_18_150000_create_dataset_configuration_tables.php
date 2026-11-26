<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        foreach (['dataset_sectors' => 'sector_id', 'dataset_subsectors' => 'subsector_id'] as $name => $column) {
            Schema::create($name, function (Blueprint $table) use ($column) {
                $table->id();
                $table->foreignId('dataset_definition_id')->constrained('dataset_definitions')->restrictOnDelete();
                $table->foreignId($column)->constrained('reference_data_values')->restrictOnDelete();
                $table->unique(['dataset_definition_id', $column]);
            });
        }
        Schema::create('dimension_definitions', function (Blueprint $table) {
            $table->id();
            $table->string('dimension_code', 100)->unique();
            $table->string('name_en');
            $table->string('name_sw')->nullable();
            $table->enum('data_type', ['reference', 'text', 'integer', 'decimal', 'boolean', 'date']);
            $table->foreignId('reference_type_id')->nullable()->constrained('reference_data_types')->restrictOnDelete();
            $table->enum('status', ['active', 'inactive'])->default('active');
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
        });
        Schema::create('dataset_dimensions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dataset_definition_id')->constrained('dataset_definitions')->restrictOnDelete();
            $table->foreignId('dimension_id')->constrained('dimension_definitions')->restrictOnDelete();
            $table->boolean('is_required')->default(true);
            $table->unsignedInteger('display_order')->default(1);
            $table->timestamps();
            $table->unique(['dataset_definition_id', 'dimension_id']);
            $table->index(['dataset_definition_id', 'display_order']);
        });
        Schema::create('template_versions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dataset_definition_id')->constrained('dataset_definitions')->restrictOnDelete();
            $table->unsignedInteger('version_number');
            $table->string('template_format')->default('json');
            // Snapshot kamili huhifadhi maana ya data bila kutegemea catalogue itakayobadilika.
            $table->jsonb('template_content');
            $table->timestamp('effective_from');
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamp('created_at');
            $table->unique(['dataset_definition_id', 'version_number']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('template_versions');
        Schema::dropIfExists('dataset_dimensions');
        Schema::dropIfExists('dimension_definitions');
        Schema::dropIfExists('dataset_subsectors');
        Schema::dropIfExists('dataset_sectors');
    }
};
