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
                if (!Schema::hasColumn('quizzes', 'cover_image_meta')) {
                    $table->json('cover_image_meta')->nullable()->after('cover_image_path');
                }

                if (!Schema::hasColumn('quizzes', 'cover_video_meta')) {
                    $table->json('cover_video_meta')->nullable()->after('cover_video_url');
                }
            });
        }

        if (Schema::hasTable('questions')) {
            Schema::table('questions', function (Blueprint $table): void {
                if (!Schema::hasColumn('questions', 'image_meta')) {
                    $table->json('image_meta')->nullable()->after('image_path');
                }

                if (!Schema::hasColumn('questions', 'video_meta')) {
                    $table->json('video_meta')->nullable()->after('video_url');
                }
            });
        }

        if (Schema::hasTable('question_options')) {
            Schema::table('question_options', function (Blueprint $table): void {
                if (!Schema::hasColumn('question_options', 'image_meta')) {
                    $table->json('image_meta')->nullable()->after('image_path');
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('question_options')) {
            Schema::table('question_options', function (Blueprint $table): void {
                if (Schema::hasColumn('question_options', 'image_meta')) {
                    $table->dropColumn('image_meta');
                }
            });
        }

        if (Schema::hasTable('questions')) {
            Schema::table('questions', function (Blueprint $table): void {
                if (Schema::hasColumn('questions', 'video_meta')) {
                    $table->dropColumn('video_meta');
                }

                if (Schema::hasColumn('questions', 'image_meta')) {
                    $table->dropColumn('image_meta');
                }
            });
        }

        if (Schema::hasTable('quizzes')) {
            Schema::table('quizzes', function (Blueprint $table): void {
                if (Schema::hasColumn('quizzes', 'cover_video_meta')) {
                    $table->dropColumn('cover_video_meta');
                }

                if (Schema::hasColumn('quizzes', 'cover_image_meta')) {
                    $table->dropColumn('cover_image_meta');
                }
            });
        }
    }
};
