<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('approval_circles', function (Blueprint $t) {
            $t->id();
            $t->string('name', 120);
            $t->foreignId('institution_id')->nullable()->constrained()->restrictOnDelete();
            $t->foreignId('department_id')->nullable()->constrained()->restrictOnDelete();
            $t->string('scope_key', 100);
            $t->unsignedInteger('version_number');
            $t->string('status', 20)->default('draft');
            $t->boolean('is_active')->default(false);
            $t->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $t->timestamp('activated_at')->nullable();
            $t->timestamps();
            $t->unique(['scope_key', 'version_number']);
        });
        DB::statement('CREATE UNIQUE INDEX approval_circles_active_scope ON approval_circles (scope_key) WHERE is_active = true');
        Schema::create('approval_circle_steps', function (Blueprint $t) {
            $t->id();
            $t->foreignId('approval_circle_id')->constrained()->cascadeOnDelete();
            $t->unsignedInteger('sequence');
            $t->string('step_name', 120);
            $t->string('required_role_code', 20);
            $t->foreign('required_role_code')->references('code')->on('roles')->restrictOnDelete();
            $t->foreignId('assigned_user_id')->nullable()->constrained('users')->restrictOnDelete();
            $t->string('action', 20);
            $t->string('level', 20);
            $t->boolean('can_return')->default(true);
            $t->timestamps();
            $t->unique(['approval_circle_id', 'sequence']);
        });
        Schema::create('submissions', function (Blueprint $t) {
            $t->id();
            $t->string('reference', 80)->unique();
            $t->foreignId('reporting_calendar_id')->unique()->constrained('dataset_reporting_calendars')->restrictOnDelete();
            $t->foreignId('template_version_id')->constrained()->restrictOnDelete();
            $t->foreignId('approval_circle_id')->nullable()->constrained()->restrictOnDelete();
            $t->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $t->string('status', 20)->default('draft');
            $t->unsignedInteger('current_step')->nullable();
            $t->unsignedInteger('revision')->default(0);
            $t->unsignedInteger('attempt')->default(0);
            $t->date('correction_deadline')->nullable();
            $t->timestamp('submitted_at')->nullable();
            $t->timestamp('published_at')->nullable();
            $t->timestamps();
            $t->index(['status', 'approval_circle_id']);
        });
        Schema::create('submission_values', function (Blueprint $t) {
            $t->id();
            $t->foreignId('submission_id')->constrained()->cascadeOnDelete();
            $t->foreignId('indicator_id')->constrained()->restrictOnDelete();
            $t->json('dimension_values');
            $t->string('dimension_key', 64);
            $t->string('data_type', 20);
            $t->decimal('value_numeric', 24, 6)->nullable();
            $t->text('value_text')->nullable();
            $t->boolean('value_boolean')->nullable();
            $t->date('value_date')->nullable();
            $t->timestamps();
            $t->unique(['submission_id', 'indicator_id', 'dimension_key'], 'submission_value_identity');
        });
        Schema::create('submission_approvals', function (Blueprint $t) {
            $t->id();
            $t->foreignId('submission_id')->constrained()->restrictOnDelete();
            $t->foreignId('actor_id')->constrained('users')->restrictOnDelete();
            $t->string('action', 30);
            $t->string('step_name', 120)->nullable();
            $t->text('comments')->nullable();
            $t->json('meta');
            $t->timestamp('acted_at');
            $t->timestamps();
        });
        Schema::create('submission_revisions', function (Blueprint $t) {
            $t->id();
            $t->foreignId('submission_id')->constrained()->restrictOnDelete();
            $t->unsignedInteger('attempt');
            $t->json('values');
            $t->timestamp('submitted_at');
            $t->foreignId('submitted_by')->constrained('users')->restrictOnDelete();
            $t->unique(['submission_id', 'attempt']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('submission_revisions');
        Schema::dropIfExists('submission_approvals');
        Schema::dropIfExists('submission_values');
        Schema::dropIfExists('submissions');
        Schema::dropIfExists('approval_circle_steps');
        Schema::dropIfExists('approval_circles');
    }
};
