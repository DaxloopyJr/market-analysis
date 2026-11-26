<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dataset_definitions', function (Blueprint $table) {
            $table->id();

            // Taasisi hubeba umiliki; department hutajwa kwa dataset ya department ya wizara.
            $table->foreignId('institution_id')->constrained('institutions')->restrictOnDelete();
            $table->foreignId('department_id')->nullable()->constrained('departments')->restrictOnDelete();
            $table->string('dataset_code', 100);
            $table->string('dataset_name');
            $table->text('description')->nullable();
            
            // Activation itahitaji indicators na configuration halali kupitia service.
            $table->enum('status', ['draft', 'active', 'inactive'])->default('draft');
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();

            // Code haitajirudia ndani ya taasisi, hata kwenye departments zake tofauti.
            $table->unique(['institution_id', 'dataset_code']);
            $table->index(['institution_id', 'status']);
            $table->index(['department_id', 'status']);
        });

        Schema::create('dataset_frequencies', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dataset_definition_id')->constrained('dataset_definitions')->restrictOnDelete();
            // Dataset inaweza kuruhusu vipindi zaidi ya kimoja bila kuhifadhi orodha kwenye string.
            $table->enum('frequency', ['daily', 'weekly', 'monthly', 'quarterly', 'semiannual', 'annual']);
            $table->timestamps();
            $table->unique(['dataset_definition_id', 'frequency']);
        });
    }

    public function down(): void
    {
        // Jedwali tegemezi huondolewa kwanza wakati wa rollback.
        Schema::dropIfExists('dataset_frequencies');
        Schema::dropIfExists('dataset_definitions');
    }
};
