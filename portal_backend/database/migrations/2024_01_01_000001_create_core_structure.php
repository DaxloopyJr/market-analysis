<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Core structure - merged & harmonized (was 000001 + 000006):
 * institutions, departments, roles, permissions, pivots, users, tokens, delegations.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('institutions', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->string('code', 20)->unique();
            $t->string('short_name', 80)->nullable();
            $t->string('type', 40)->default('institution'); // institution | agency | commission
            $t->text('description')->nullable();
            $t->boolean('is_active')->default(true);
            $t->string('status', 20)->default('active');
            $t->timestamps();
            $t->softDeletes();
        });

        Schema::create('departments', function (Blueprint $t) {
            $t->id();
            $t->foreignId('parent_department_id')->nullable()->constrained('departments')->nullOnDelete();
            $t->string('name');
            $t->string('code', 20)->unique();
            $t->text('description')->nullable();
            $t->boolean('is_active')->default(true);
            $t->string('status', 20)->default('active');
            $t->timestamps();
            $t->softDeletes();
        });

        Schema::create('roles', function (Blueprint $t) {
            $t->id();
            $t->string('code', 20)->unique();   // ME, MOA, IA, IDO, DDO, OMU, IM, IHOD, AO, MDO, MDD
            $t->string('name');
            $t->string('level', 20)->default('institution'); // ministry | institution
            $t->text('description')->nullable();
            $t->boolean('is_system')->default(false);
            $t->boolean('is_active')->default(true);
            $t->string('status', 20)->default('active');
            $t->timestamps();
        });

        Schema::create('permissions', function (Blueprint $t) {
            $t->id();
            $t->string('code', 60)->unique();   // e.g. submissions.create
            $t->string('name', 120)->nullable();
            $t->string('module', 60)->nullable();
            $t->string('nav_item', 60)->nullable();
            $t->string('access_level', 20);     // View|Create|Edit|Submit|Review|Approve|Publish|Configure|Deactivate
            $t->string('scope', 20)->default('own'); // own | institution | ministry
            $t->string('description')->nullable();
            $t->string('status', 20)->default('active');
            $t->timestamps();
        });

        Schema::create('permission_role', function (Blueprint $t) {
            $t->id();
            $t->foreignId('role_id')->constrained()->cascadeOnDelete();
            $t->foreignId('permission_id')->constrained()->cascadeOnDelete();
            $t->unique(['role_id', 'permission_id']);
        });

        Schema::create('users', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->string('username', 60)->nullable()->unique();
            $t->string('email')->unique();
            $t->string('phone', 20)->nullable();
            $t->timestamp('email_verified_at')->nullable();
            $t->string('password');
            $t->foreignId('institution_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('department_id')->nullable()->constrained()->nullOnDelete();
            $t->boolean('is_active')->default(true);
            $t->string('status', 20)->default('active');
            $t->rememberToken();
            $t->timestamp('last_login_at')->nullable();
            $t->timestamps();
            $t->softDeletes();
        });

        // user_role: scoped assignment with effective dates + status (replaces simple role_user)
        Schema::create('user_role', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->foreignId('role_id')->constrained()->cascadeOnDelete();
            $t->foreignId('institution_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('department_id')->nullable()->constrained()->nullOnDelete();
            $t->date('effective_from')->default(now());
            $t->date('effective_to')->nullable();
            $t->string('status', 20)->default('active');
            $t->timestamps();
            $t->unique(['user_id', 'role_id', 'institution_id', 'department_id'], 'user_role_unique');
        });

        // delegation: delegate a role to another user for a period
        Schema::create('delegations', function (Blueprint $t) {
            $t->id();
            $t->foreignId('delegator_user_id')->constrained('users')->cascadeOnDelete();
            $t->foreignId('delegate_user_id')->constrained('users')->cascadeOnDelete();
            $t->foreignId('role_id')->constrained()->cascadeOnDelete();
            $t->foreignId('department_id')->nullable()->constrained()->nullOnDelete();
            $t->date('effective_from')->default(now());
            $t->date('effective_to')->nullable();
            $t->string('status', 20)->default('active');
            $t->timestamps();
        });

        Schema::create('personal_access_tokens', function (Blueprint $t) {
            $t->id();
            $t->morphs('tokenable');
            $t->string('name');
            $t->string('token', 64)->unique();
            $t->text('abilities')->nullable();
            $t->timestamp('last_used_at')->nullable();
            $t->timestamp('expires_at')->nullable();
            $t->timestamps();
        });

        Schema::create('password_reset_tokens', function (Blueprint $t) {
            $t->string('email')->primary();
            $t->string('token');
            $t->timestamp('created_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('password_reset_tokens');
        Schema::dropIfExists('personal_access_tokens');
        Schema::dropIfExists('delegations');
        Schema::dropIfExists('user_role');
        Schema::dropIfExists('users');
        Schema::dropIfExists('permission_role');
        Schema::dropIfExists('permissions');
        Schema::dropIfExists('roles');
        Schema::dropIfExists('departments');
        Schema::dropIfExists('institutions');
    }
};
