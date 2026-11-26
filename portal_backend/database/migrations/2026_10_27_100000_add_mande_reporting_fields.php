<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('indicators', function (Blueprint $table) {
            $table->string('strategic_objective', 20)->nullable()->index();
            $table->string('result_level', 30)->default('output');
            $table->decimal('baseline_value', 24, 6)->nullable();
            $table->decimal('performance_weight', 10, 4)->default(1);
        });
        if (! Schema::hasColumn('indicators', 'performance_direction')) {
            Schema::table('indicators', function (Blueprint $table) {
                $table->string('performance_direction')->default('higher_is_better');
            });
        }
        Schema::table('submissions', function (Blueprint $table) {
            $table->decimal('approved_budget', 24, 2)->nullable();
            $table->decimal('actual_expenditure', 24, 2)->nullable();
            $table->text('achievements')->nullable();
            $table->text('implementation_challenges')->nullable();
            $table->text('corrective_actions')->nullable();
            $table->text('me_comments')->nullable();
        });
    }

    public function down(): void
    {
        if (Schema::hasColumn('indicators', 'performance_direction')) {
            Schema::table('indicators', fn (Blueprint $table) => $table->dropColumn('performance_direction'));
        }
        Schema::table('submissions', function (Blueprint $table) {
            $table->dropColumn(['approved_budget', 'actual_expenditure', 'achievements', 'implementation_challenges', 'corrective_actions', 'me_comments']);
        });
        Schema::table('indicators', function (Blueprint $table) {
            $table->dropColumn(['strategic_objective', 'result_level', 'baseline_value', 'performance_weight']);
        });
    }
};
