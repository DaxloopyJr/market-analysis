<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('indicators', function (Blueprint $table) {
            $table->id();
            // Indicator inaweza kutumiwa na datasets zaidi ya moja kupitia dataset_indicators.
            $table->string('indicator_code', 100)->unique();
            $table->string('name_en');
            $table->string('name_sw')->nullable();
            $table->text('description_en')->nullable();
            $table->text('description_sw')->nullable();

            // Data type hutaja aina ya value; fedha na asilimia hutumia decimal pamoja na unit husika.
            $table->enum('data_type', ['integer', 'decimal', 'text', 'boolean', 'date']);
            // Unit hutoka reference data; service itahakikisha value iliyochaguliwa ni ya aina UNIT.
            // Text, boolean na date zinaweza kutokuwa na unit. Unit inayotumika hailazimishwi kufutwa.
            $table->foreignId('unit_id')->nullable()->constrained('reference_data_values')->restrictOnDelete();

            // None huzuia kujumlisha bila kanuni; asilimia hazijumlishwi wala kupewa wastani moja kwa moja.
            // Service itahakiki ulinganifu wa aggregation na data type kabla ya kuhifadhi configuration.
            $table->enum('aggregation_rule', ['none', 'sum', 'average', 'min', 'max', 'latest'])->default('none');
            $table->enum('status', ['active', 'inactive'])->default('active');
            // Creator hutambuliwa na backend ili kudhibiti uhariri wa catalogue inayoshirikiwa.
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();

            $table->index('unit_id');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('indicators');
    }
};
