<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('permissions')) {
            Schema::create('permissions', function (Blueprint $table): void {
                $table->id();
                $table->string('name', 120)->unique();
                $table->text('description')->nullable();
                $table->timestamp('created_at')->nullable();
            });
        }

        if (!Schema::hasTable('role_permissions')) {
            Schema::create('role_permissions', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('role_id')->constrained('roles')->cascadeOnDelete();
                $table->foreignId('permission_id')->constrained('permissions')->cascadeOnDelete();
                $table->timestamp('created_at')->nullable();
                $table->unique(['role_id', 'permission_id']);
            });
        }

        $now = now();
        $baseRoles = ['admin', 'teacher', 'instructor', 'student'];
        foreach ($baseRoles as $baseRole) {
            DB::table('roles')->updateOrInsert(
                ['name' => $baseRole],
                [
                    'created_at' => $now,
                    'updated_at' => $now,
                ]
            );
        }

        $permissions = [
            ['name' => 'users.view', 'description' => 'View users'],
            ['name' => 'users.create', 'description' => 'Create users'],
            ['name' => 'users.update', 'description' => 'Update users'],
            ['name' => 'users.delete', 'description' => 'Delete users'],
            ['name' => 'users.block', 'description' => 'Block or activate users'],
            ['name' => 'roles.view', 'description' => 'View roles'],
            ['name' => 'roles.create', 'description' => 'Create roles'],
            ['name' => 'roles.update', 'description' => 'Update roles'],
            ['name' => 'roles.delete', 'description' => 'Delete roles'],
            ['name' => 'roles.assign_permissions', 'description' => 'Assign permissions to roles'],
            ['name' => 'quizzes.view', 'description' => 'View quizzes'],
            ['name' => 'quizzes.create', 'description' => 'Create quizzes'],
            ['name' => 'quizzes.update', 'description' => 'Update quizzes'],
            ['name' => 'quizzes.delete', 'description' => 'Delete quizzes'],
            ['name' => 'quizzes.publish', 'description' => 'Publish quizzes'],
            ['name' => 'rooms.manage', 'description' => 'Manage rooms'],
            ['name' => 'attempts.view', 'description' => 'View attempts'],
            ['name' => 'reports.view', 'description' => 'View reports'],
            ['name' => 'notifications.manage', 'description' => 'Manage notifications'],
            ['name' => 'cheating_logs.view', 'description' => 'View cheating logs'],
        ];

        foreach ($permissions as $permission) {
            DB::table('permissions')->updateOrInsert(
                ['name' => $permission['name']],
                [
                    'description' => $permission['description'],
                    'created_at' => $now,
                ]
            );
        }

        $adminRoleIds = DB::table('roles')
            ->whereRaw('LOWER(name) = ?', ['admin'])
            ->pluck('id')
            ->all();
        $permissionIds = DB::table('permissions')->pluck('id')->all();

        foreach ($adminRoleIds as $roleId) {
            foreach ($permissionIds as $permissionId) {
                DB::table('role_permissions')->updateOrInsert(
                    ['role_id' => $roleId, 'permission_id' => $permissionId],
                    ['created_at' => $now]
                );
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('role_permissions');
        Schema::dropIfExists('permissions');
    }
};
