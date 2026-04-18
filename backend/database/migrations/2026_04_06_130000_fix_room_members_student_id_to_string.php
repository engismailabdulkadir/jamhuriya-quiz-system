<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('room_members') || !Schema::hasColumn('room_members', 'student_id')) {
            return;
        }

        if (!in_array(DB::getDriverName(), ['mysql', 'mariadb'], true)) {
            return;
        }

        $database = DB::getDatabaseName();
        $type = DB::table('information_schema.COLUMNS')
            ->where('TABLE_SCHEMA', $database)
            ->where('TABLE_NAME', 'room_members')
            ->where('COLUMN_NAME', 'student_id')
            ->value('DATA_TYPE');

        if (strtolower((string) $type) === 'varchar') {
            return;
        }

        $foreignKeys = DB::select(
            "SELECT CONSTRAINT_NAME
             FROM information_schema.KEY_COLUMN_USAGE
             WHERE TABLE_SCHEMA = ?
               AND TABLE_NAME = 'room_members'
               AND COLUMN_NAME = 'student_id'
               AND REFERENCED_TABLE_NAME IS NOT NULL",
            [$database]
        );

        foreach ($foreignKeys as $foreignKey) {
            $name = (string) ($foreignKey->CONSTRAINT_NAME ?? '');
            if ($name === '') {
                continue;
            }

            DB::statement(sprintf(
                'ALTER TABLE `room_members` DROP FOREIGN KEY `%s`',
                str_replace('`', '``', $name)
            ));
        }

        DB::statement('ALTER TABLE `room_members` MODIFY `student_id` VARCHAR(50) NOT NULL');
    }

    public function down(): void
    {
        // Keep as-is to avoid destructive conversion back to numeric type.
    }
};
