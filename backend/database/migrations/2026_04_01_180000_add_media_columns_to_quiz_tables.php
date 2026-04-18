<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('quizzes')) {
            Schema::table('quizzes', function (Blueprint $table): void {
                if (!Schema::hasColumn('quizzes', 'cover_image_path')) {
                    $table->string('cover_image_path')->nullable()->after('description');
                }

                if (!Schema::hasColumn('quizzes', 'cover_video_url')) {
                    $table->string('cover_video_url', 1000)->nullable()->after('cover_image_path');
                }
            });
        }

        if (Schema::hasTable('questions')) {
            Schema::table('questions', function (Blueprint $table): void {
                if (!Schema::hasColumn('questions', 'image_path')) {
                    $table->string('image_path')->nullable()->after('explanation');
                }

                if (!Schema::hasColumn('questions', 'video_url')) {
                    $table->string('video_url', 1000)->nullable()->after('image_path');
                }
            });
        }

        if (Schema::hasTable('question_options')) {
            Schema::table('question_options', function (Blueprint $table): void {
                if (!Schema::hasColumn('question_options', 'image_path')) {
                    $table->string('image_path')->nullable()->after('option_text');
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('question_options')) {
            Schema::table('question_options', function (Blueprint $table): void {
                if (Schema::hasColumn('question_options', 'image_path')) {
                    $table->dropColumn('image_path');
                }
            });
        }

        if (Schema::hasTable('questions')) {
            Schema::table('questions', function (Blueprint $table): void {
                if (Schema::hasColumn('questions', 'video_url')) {
                    $table->dropColumn('video_url');
                }

                if (Schema::hasColumn('questions', 'image_path')) {
                    $table->dropColumn('image_path');
                }
            });
        }

        if (Schema::hasTable('quizzes')) {
            Schema::table('quizzes', function (Blueprint $table): void {
                if (Schema::hasColumn('quizzes', 'cover_video_url')) {
                    $table->dropColumn('cover_video_url');
                }

                if (Schema::hasColumn('quizzes', 'cover_image_path')) {
                    $table->dropColumn('cover_image_path');
                }
            });
        }
    }
};

