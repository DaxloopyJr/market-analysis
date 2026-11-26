<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Huunda hifadhi ya audit bila updated_at kwa kuwa rekodi hazihaririwi.
     */
    public function up(): void
    {
        Schema::create('audit_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->string('actor_type')->default('user');
            $table->string('event_type')->index();
            $table->string('entity_id')->nullable();
            $table->string('entity_type')->nullable();
            $table->ipAddress('ip_address')->nullable();
            $table->uuid('request_id')->nullable()->index();

            $table->jsonb('old_values')->nullable();
            $table->jsonb('new_values')->nullable();
            $table->text('reason')->nullable();

            $table->timestampTz('created_at')->useCurrent()->index();

            $table->index(['entity_type', 'entity_id']);
            $table->index(['user_id', 'created_at']);

        });
    }

    /**
     * Huondoa schema wakati wa rollback iliyodhibitiwa ya deployment.
     */
    public function down(): void
    {
        Schema::dropIfExists('audit_events');
    }
};
