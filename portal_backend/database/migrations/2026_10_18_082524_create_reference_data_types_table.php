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
        Schema::create('reference_data_types', function (Blueprint $table) {
            $table->id();
            $table->string('data_type_code')->unique();
            $table->string('data_type_name_sw')->nullable();    
            $table->string('data_type_name_en');
            $table->string('description_sw')->nullable();
            $table->string('description_en')->nullable();
            $table->enum('status', ['active', 'inactive'])->default('active');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('reference_data_types');
    }
};
