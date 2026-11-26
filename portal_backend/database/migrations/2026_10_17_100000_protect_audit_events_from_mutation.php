<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Model events hazizuii bulk queries; PostgreSQL inalinda rekodi pia.
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        // migrate:fresh drops tables and their triggers, but PostgreSQL functions survive.
        DB::unprepared(<<<'SQL'
            CREATE OR REPLACE FUNCTION prevent_audit_event_mutation() RETURNS trigger
            LANGUAGE plpgsql AS $$
            BEGIN
                RAISE EXCEPTION 'Audit events cannot be updated, deleted or truncated';
            END;
            $$;
            CREATE TRIGGER audit_events_no_mutation
            BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_events
            FOR EACH STATEMENT EXECUTE FUNCTION prevent_audit_event_mutation();
            SQL);
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        DB::unprepared('DROP TRIGGER IF EXISTS audit_events_no_mutation ON audit_events');
        DB::unprepared('DROP FUNCTION IF EXISTS prevent_audit_event_mutation()');
    }
};
