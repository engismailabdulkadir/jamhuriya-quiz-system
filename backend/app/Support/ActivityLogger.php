<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Throwable;

class ActivityLogger
{
    public static function log(
        ?int $userId,
        string $action,
        ?string $entityType = null,
        ?int $entityId = null,
        ?int $instructorId = null
    ): void {
        try {
            if (Schema::hasTable('system_logs')) {
                DB::table('system_logs')->insert([
                    'user_id' => $userId,
                    'action' => $action,
                    'created_at' => now(),
                ]);
            }

            if ($userId && Schema::hasTable('audit_trails')) {
                $auditPayload = [
                    'user_id' => $userId,
                    'action' => $action,
                    'created_at' => now(),
                ];

                if ($entityType !== null && Schema::hasColumn('audit_trails', 'entity_type')) {
                    $auditPayload['entity_type'] = $entityType;
                }

                if ($entityId !== null && Schema::hasColumn('audit_trails', 'entity_id')) {
                    $auditPayload['entity_id'] = $entityId;
                }

                DB::table('audit_trails')->insert($auditPayload);
            }

            if ($instructorId && Schema::hasTable('instructor_actions')) {
                DB::table('instructor_actions')->insert([
                    'instructor_id' => $instructorId,
                    'action' => $action,
                    'created_at' => now(),
                ]);
            }
        } catch (Throwable $exception) {
            report($exception);
        }
    }

    public static function login(?int $userId, ?string $ipAddress = null): void
    {
        if (!$userId) {
            return;
        }

        try {
            if (Schema::hasTable('login_history')) {
                $payload = [
                    'user_id' => $userId,
                    'login_time' => now(),
                ];

                if (Schema::hasColumn('login_history', 'ip_address')) {
                    $payload['ip_address'] = $ipAddress;
                }

                DB::table('login_history')->insert($payload);
            }
        } catch (Throwable $exception) {
            report($exception);
        }
    }
}

