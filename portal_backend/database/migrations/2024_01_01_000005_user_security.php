<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Login lockout counters + password-reset OTP codes (email or SMS). */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('users')) {
            Schema::table('users', function (Blueprint $t) {
                if (! Schema::hasColumn('users', 'failed_attempts')) $t->unsignedSmallInteger('failed_attempts')->default(0)->after('last_login_at');
                if (! Schema::hasColumn('users', 'locked_until'))   $t->timestamp('locked_until')->nullable()->after('failed_attempts');
            });
        }
        if (! Schema::hasTable('password_reset_codes')) {
            Schema::create('password_reset_codes', function (Blueprint $t) {
                $t->id();
                $t->foreignId('user_id')->constrained()->cascadeOnDelete();
                $t->string('method', 10);              // email | sms
                $t->string('destination');             // email address or phone number
                $t->string('code');                    // hashed 6-digit OTP
                $t->unsignedSmallInteger('attempts')->default(0);
                $t->timestamp('expires_at');
                $t->timestamp('used_at')->nullable();
                $t->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('password_reset_codes');
        if (Schema::hasTable('users')) {
            Schema::table('users', function (Blueprint $t) {
                if (Schema::hasColumn('users', 'locked_until'))   $t->dropColumn('locked_until');
                if (Schema::hasColumn('users', 'failed_attempts')) $t->dropColumn('failed_attempts');
            });
        }
    }
};
