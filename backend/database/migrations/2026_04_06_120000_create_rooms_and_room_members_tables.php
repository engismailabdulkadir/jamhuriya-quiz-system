<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('rooms')) {
            Schema::create('rooms', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('instructor_id')->nullable()->constrained('users')->nullOnDelete();
                $table->string('name', 200);
                $table->string('code', 100)->index();
                $table->unsignedInteger('capacity')->default(30);
                $table->boolean('is_active')->default(true);
                $table->enum('status', ['active', 'inactive'])->default('active');
                $table->timestamps();
            });
        } else {
            Schema::table('rooms', function (Blueprint $table): void {
                if (!Schema::hasColumn('rooms', 'instructor_id')) {
                    $table->unsignedBigInteger('instructor_id')->nullable()->after('id');
                    $table->index('instructor_id');
                }

                if (!Schema::hasColumn('rooms', 'name')) {
                    $table->string('name', 200)->nullable()->after('instructor_id');
                }

                if (!Schema::hasColumn('rooms', 'code')) {
                    $table->string('code', 100)->nullable()->after('name');
                    $table->index('code');
                }

                if (!Schema::hasColumn('rooms', 'capacity')) {
                    $table->unsignedInteger('capacity')->default(30)->after('code');
                }

                if (!Schema::hasColumn('rooms', 'is_active')) {
                    $table->boolean('is_active')->default(true)->after('capacity');
                }

                if (!Schema::hasColumn('rooms', 'status')) {
                    $table->enum('status', ['active', 'inactive'])->default('active')->after('is_active');
                }
            });
        }

        if (!Schema::hasTable('room_members')) {
            Schema::create('room_members', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('room_id')->constrained('rooms')->cascadeOnDelete();
                $table->string('student_id', 50);
                $table->string('student_name', 150);
                $table->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
                $table->unique(['room_id', 'student_id']);
            });
        } else {
            Schema::table('room_members', function (Blueprint $table): void {
                if (!Schema::hasColumn('room_members', 'room_id')) {
                    $table->unsignedBigInteger('room_id')->nullable()->after('id');
                    $table->index('room_id');
                }

                if (!Schema::hasColumn('room_members', 'student_id')) {
                    $table->string('student_id', 50)->nullable()->after('room_id');
                }

                if (!Schema::hasColumn('room_members', 'student_name')) {
                    $table->string('student_name', 150)->nullable()->after('student_id');
                }

                if (!Schema::hasColumn('room_members', 'created_by_user_id')) {
                    $table->unsignedBigInteger('created_by_user_id')->nullable()->after('student_name');
                    $table->index('created_by_user_id');
                }
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('room_members');
        Schema::dropIfExists('rooms');
    }
};

