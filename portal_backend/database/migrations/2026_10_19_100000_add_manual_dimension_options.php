<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dimension_options', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dimension_id')->constrained('dimension_definitions')->restrictOnDelete();
            $table->string('code', 100);
            $table->string('name_en');
            $table->string('name_sw')->nullable();
            $table->timestamps();
            $table->unique(['dimension_id', 'code']);
        });
        Schema::create('dataset_dimension_indicators', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dataset_dimension_id')->constrained('dataset_dimensions')->cascadeOnDelete();
            // Indicator yenye dimension lazima iondolewe kwenye dimension kabla ya detach.
            $table->foreignId('dataset_indicator_id')->constrained('dataset_indicators')->restrictOnDelete();
            $table->unique(['dataset_dimension_id', 'dataset_indicator_id'], 'dimension_indicator_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dataset_dimension_indicators');
        Schema::dropIfExists('dimension_options');
    }
};
