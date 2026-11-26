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
        Schema::table('submissions', function (Blueprint $table) {
            $table->foreignId('ministry_approval_circle_id')->nullable()->constrained('approval_circles')->restrictOnDelete();
            // Null preserves the original single-workflow path of already submitted records.
            $table->string('workflow_stage', 20)->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('submissions', function (Blueprint $table) {
            $table->dropConstrainedForeignId('ministry_approval_circle_id');
            $table->dropColumn('workflow_stage');
        });
    }
};
