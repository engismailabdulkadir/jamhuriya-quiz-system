<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('quiz_settings')) {
            return;
        }

        Schema::table('quiz_settings', function (Blueprint $table): void {
            if (!Schema::hasColumn('quiz_settings', 'delivery_method')) {
                $table->string('delivery_method', 50)->default('instant_feedback')->after('quiz_id');
            }

            if (!Schema::hasColumn('quiz_settings', 'require_names')) {
                $table->boolean('require_names')->default(true)->after('delivery_method');
            }

            if (!Schema::hasColumn('quiz_settings', 'show_question_feedback')) {
                $table->boolean('show_question_feedback')->default(true)->after('require_names');
            }

            if (!Schema::hasColumn('quiz_settings', 'show_final_score')) {
                $table->boolean('show_final_score')->default(false)->after('show_question_feedback');
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('quiz_settings')) {
            return;
        }

        Schema::table('quiz_settings', function (Blueprint $table): void {
            $columnsToDrop = array_filter([
                Schema::hasColumn('quiz_settings', 'delivery_method') ? 'delivery_method' : null,
                Schema::hasColumn('quiz_settings', 'require_names') ? 'require_names' : null,
                Schema::hasColumn('quiz_settings', 'show_question_feedback') ? 'show_question_feedback' : null,
                Schema::hasColumn('quiz_settings', 'show_final_score') ? 'show_final_score' : null,
            ]);

            if ($columnsToDrop !== []) {
                $table->dropColumn($columnsToDrop);
            }
        });
    }
};
