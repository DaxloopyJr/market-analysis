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
        Schema::table('audit_events', function (Blueprint $table) {
            $table->json('actor_snapshot')->nullable();
        });

        Schema::table('dataset_definitions', function (Blueprint $table) {
            $table->json('creator_snapshot')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('audit_events', function (Blueprint $table) {
            $table->dropColumn('actor_snapshot');
        });

        Schema::table('dataset_definitions', function (Blueprint $table) {
            $table->dropColumn('creator_snapshot');
        });
    }
};
