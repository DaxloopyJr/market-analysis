<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('dataset_definitions', function (Blueprint $table) {
            Schema::table('dataset_definitions', function (Blueprint $table) {
                $table->foreignId('responsible_user_id')->nullable()->constrained('users')->restrictOnDelete();
            });
            // Preserve existing assignments; legacy masters without settings remain unassigned.
            DB::table('dataset_definitions')->whereNotNull('reporting_settings')->orderBy('id')->each(function ($dataset) {
                $settings = json_decode($dataset->reporting_settings, true);
                $id = $settings['responsibleUserId'] ?? null;
                if ($id && DB::table('users')->where('id', $id)->exists()) {
                    DB::table('dataset_definitions')->where('id', $dataset->id)->update(['responsible_user_id' => $id]);
                }
            });
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('dataset_definitions', function (Blueprint $table) {
            Schema::table('dataset_definitions', function (Blueprint $table) {
                $table->dropConstrainedForeignId('responsible_user_id');
            });
        });
    }
};
