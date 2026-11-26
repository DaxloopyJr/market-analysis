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
        Schema::create('reference_data_values', function (Blueprint $table) {
            $table->id();
            // Type yenye values haiwezi kufutwa; status hutumika kusitisha matumizi.
            $table->foreignId('data_type_id')->constrained('reference_data_types')->restrictOnDelete();
            $table->string('data_value_code');
            $table->string('data_value_name_sw')->nullable();
            $table->string('data_value_name_en');
            $table->foreignId('parent_id')->nullable()->constrained('reference_data_values')->restrictOnDelete();
            $table->string('value')->nullable();
            $table->date('effective_from')->nullable();
            $table->date('effective_to')->nullable();
            $table->enum('status', ['active', 'inactive'])->default('active');
            $table->timestamps();
            $table->unique(['data_type_id', 'data_value_code']);
            $table->index('parent_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('reference_data_values');
    }
};
