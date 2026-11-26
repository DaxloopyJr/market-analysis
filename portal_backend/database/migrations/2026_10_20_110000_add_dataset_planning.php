<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('dataset_definitions', function (Blueprint $table) {
            // Nullable hulinda datasets za zamani zisizo na maelezo haya bado.
            $table->string('collection_method')->nullable();
            $table->string('source_system_name')->nullable();
            $table->text('source_description')->nullable();
            $table->string('priority')->nullable();
            $table->foreignId('priority_updated_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('priority_updated_at')->nullable();
            $table->text('priority_reason')->nullable();
        });
        Schema::create('data_consumers', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('normalized_name')->unique();
            $table->string('short_name', 50)->nullable();
            $table->text('description')->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
        });
        Schema::create('dataset_consumers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dataset_definition_id')->constrained()->restrictOnDelete();
            $table->foreignId('data_consumer_id')->constrained()->restrictOnDelete();
            $table->timestamps();
            $table->unique(['dataset_definition_id', 'data_consumer_id']);
        });
        Schema::create('dataset_reporting_calendars', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dataset_definition_id')->constrained()->restrictOnDelete();
            $table->foreignId('reporting_period_id')->constrained()->restrictOnDelete();
            $table->foreignId('responsible_user_id')->constrained('users')->restrictOnDelete();
            $table->unsignedSmallInteger('deadline_days');
            $table->date('deadline');
            $table->json('reminder_days');
            // Submission service itajaza submitted_at ndani ya transaction ya kuwasilisha.
            $table->timestamp('submitted_at')->nullable();
            $table->boolean('reminders_enabled')->default(false);
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
            $table->unique(['dataset_definition_id', 'reporting_period_id'], 'dataset_calendar_period_unique');
            $table->index(['reminders_enabled', 'deadline']);
        });
        Schema::create('dataset_reminders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('calendar_id')->constrained('dataset_reporting_calendars')->restrictOnDelete();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->date('deadline');
            $table->unsignedSmallInteger('days_before');
            $table->foreignId('notification_id')->constrained()->restrictOnDelete();
            $table->timestamps();
            $table->unique(['calendar_id', 'user_id', 'deadline', 'days_before'], 'dataset_reminder_delivery_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dataset_reminders');
        Schema::dropIfExists('dataset_reporting_calendars');
        Schema::dropIfExists('dataset_consumers');
        Schema::dropIfExists('data_consumers');
        Schema::table('dataset_definitions', function (Blueprint $table) {
            $table->dropConstrainedForeignId('priority_updated_by');
            $table->dropColumn(['collection_method', 'source_system_name', 'source_description', 'priority', 'priority_updated_at', 'priority_reason']);
        });
    }
};
