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
        Schema::create('notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('audit_event_id')->constrained('audit_events')->restrictOnDelete();
            $table->string('type');
            $table->text('message');
            $table->boolean('is_read')->default(false);
            $table->timestampTz('created_at')->useCurrent()->index();
            $table->index(['user_id', 'is_read', 'created_at']);
            $table->index(['audit_event_id', 'created_at']);
            $table->timestampTz('sent_at')->nullable()->index();

        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('notifications');
    }
};
