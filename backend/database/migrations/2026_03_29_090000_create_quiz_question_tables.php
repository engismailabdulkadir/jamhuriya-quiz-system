<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('questions')) {
            Schema::create('questions', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('quiz_id')->constrained('quizzes')->cascadeOnDelete();
                $table->enum('question_type', ['mcq_single', 'true_false', 'short_answer'])->default('mcq_single');
                $table->text('prompt');
                $table->decimal('points', 8, 2)->default(1.00);
                $table->unsignedInteger('order_no');
                $table->text('explanation')->nullable();
                $table->timestamps();

                $table->unique(['quiz_id', 'order_no']);
            });
        }

        if (!Schema::hasTable('question_options')) {
            Schema::create('question_options', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('question_id')->constrained('questions')->cascadeOnDelete();
                $table->text('option_text');
                $table->boolean('is_correct')->default(false);
                $table->unsignedInteger('order_no');
                $table->timestamps();

                $table->unique(['question_id', 'order_no']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('question_options');
        Schema::dropIfExists('questions');
    }
};
