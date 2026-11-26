<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Null hutambulisha target ya draft; version za targets zilizopo hazibadilishwi.
        Schema::table('indicator_targets', function (Blueprint $table) {
            $table->unsignedBigInteger('template_version_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        if (DB::table('indicator_targets')->whereNull('template_version_id')->exists()) {
            throw new RuntimeException('Kamilisha au ondoa draft targets kabla ya kurudisha migration.');
        }
        Schema::table('indicator_targets', function (Blueprint $table) {
            $table->unsignedBigInteger('template_version_id')->nullable(false)->change();
        });
    }
};
