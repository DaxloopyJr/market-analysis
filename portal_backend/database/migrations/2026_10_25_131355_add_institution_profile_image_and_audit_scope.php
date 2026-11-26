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
        Schema::table('institutions', function (Blueprint $table) {
            $table->string('profile_image_path')->nullable();
        });
        Schema::table('audit_events', function (Blueprint $table) {
            $table->unsignedBigInteger('institution_id')->nullable()->index();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('institutions', function (Blueprint $table) {
            $table->dropColumn('profile_image_path');
        });
        Schema::table('audit_events', function (Blueprint $table) {
            $table->dropColumn('institution_id');
        });
    }
};
