<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('indicator_code_counters', function (Blueprint $table) {
            $table->id();
            // Prefix hutenganisha taasisi na mwaka; counter hufungwa ndani ya transaction.
            $table->string('prefix', 90)->unique();
            $table->unsignedBigInteger('last_number')->default(0);
        });
        Schema::create('dataset_indicators', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dataset_definition_id')->constrained('dataset_definitions')->restrictOnDelete();
            $table->foreignId('indicator_id')->constrained('indicators')->restrictOnDelete();
            $table->boolean('is_required')->default(true);
            $table->unsignedInteger('display_order')->default(1);
            $table->timestamps();
            // Indicator hairudiwi kwenye dataset moja; mpangilio unaweza kurekebishwa baadaye.
            $table->unique(['dataset_definition_id', 'indicator_id']);
            $table->index(['dataset_definition_id', 'display_order']);
            $table->index('indicator_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dataset_indicators');
        Schema::dropIfExists('indicator_code_counters');
    }
};
