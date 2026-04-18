<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('quizzes')) {
            Schema::create('quizzes', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('instructor_id')->constrained('users')->restrictOnDelete();

                if (Schema::hasTable('rooms')) {
                    $table->foreignId('room_id')->nullable()->constrained('rooms')->nullOnDelete();
                } else {
                    $table->unsignedBigInteger('room_id')->nullable();
                }

                $table->string('title', 200);
                $table->text('description')->nullable();
                $table->unsignedInteger('time_limit_seconds')->nullable();
                $table->boolean('shuffle_questions')->default(false);
                $table->boolean('shuffle_options')->default(false);
                $table->boolean('allow_back_navigation')->default(true);
                $table->unsignedInteger('max_attempts')->default(1);
                $table->enum('status', ['draft', 'published', 'archived'])->default('draft');
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('quiz_settings')) {
            Schema::create('quiz_settings', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('quiz_id')->unique()->constrained('quizzes')->cascadeOnDelete();
                $table->boolean('fullscreen_required')->default(true);
                $table->boolean('allow_copy')->default(false);
                $table->boolean('allow_tab_switch')->default(false);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('quiz_settings');
        Schema::dropIfExists('quizzes');
    }
};
