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
        Schema::create('monitoring_request_minutes', function (Blueprint $table) {
            $table->timestamp('minute')->primary();
            $table->unsignedBigInteger('requests')->default(0);
            $table->unsignedBigInteger('server_errors')->default(0);
            $table->unsignedBigInteger('client_errors')->default(0);
            $table->unsignedBigInteger('duration_ms')->default(0);
        });
        Schema::create('monitoring_samples', function (Blueprint $table) {
            $table->id();
            $table->timestamp('collected_at')->index();
            $table->json('payload');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('monitoring_samples');
        Schema::dropIfExists('monitoring_request_minutes');
    }
};
