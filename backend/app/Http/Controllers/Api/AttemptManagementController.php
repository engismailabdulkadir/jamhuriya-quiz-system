<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;

class AttemptManagementController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['nullable', Rule::in(['all', 'ongoing', 'cancelled', 'completed', 'submitted'])],
            'search' => ['nullable', 'string', 'max:200'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:500'],
            'quiz_id' => ['nullable', 'integer', 'min:1'],
        ]);

        if (!Schema::hasTable('attempts') || !Schema::hasTable('quizzes')) {
            return response()->json([
                'attempts' => [],
                'summary' => $this->emptySummary(),
            ]);
        }

        $isAdmin = $this->isAdmin($request);
        $teacherId = (int) $request->user()->id;
        $status = strtolower((string) ($validated['status'] ?? 'all'));
        $search = trim((string) ($validated['search'] ?? ''));
        $limit = (int) ($validated['limit'] ?? 100);

        $hasUsers = Schema::hasTable('users');
        $hasRooms = Schema::hasTable('rooms') && Schema::hasColumn('quizzes', 'room_id');
        $hasQuizResults = Schema::hasTable('quiz_results');

        $baseQuery = DB::table('attempts')
            ->join('quizzes', 'quizzes.id', '=', 'attempts.quiz_id');

        if (!$isAdmin) {
            $baseQuery->where('quizzes.instructor_id', $teacherId);
        }

        $summary = $this->summaryFromQuery(clone $baseQuery);

        $query = clone $baseQuery;

        if ($hasUsers) {
            $query->leftJoin('users', 'users.id', '=', 'attempts.student_id');
        }

        if ($hasRooms) {
            $query->leftJoin('rooms', 'rooms.id', '=', 'quizzes.room_id');
        }

        if ($hasQuizResults) {
            $resultSubQuery = DB::table('quiz_results')
                ->select('attempt_id', DB::raw('MAX(total_score) as total_score'))
                ->groupBy('attempt_id');

            $query->leftJoinSub($resultSubQuery, 'attempt_scores', function ($join): void {
                $join->on('attempt_scores.attempt_id', '=', 'attempts.id');
            });
        }

        $this->applyStatusFilter($query, $status);

        if (!empty($validated['quiz_id'])) {
            $query->where('attempts.quiz_id', (int) $validated['quiz_id']);
        }

        if ($search !== '') {
            $query->where(function (Builder $builder) use ($search, $hasUsers): void {
                $builder
                    ->where('quizzes.title', 'like', "%{$search}%")
                    ->orWhereRaw('CAST(attempts.student_id AS CHAR) like ?', ["%{$search}%"]);

                if ($hasUsers && Schema::hasColumn('users', 'full_name')) {
                    $builder->orWhere('users.full_name', 'like', "%{$search}%");
                }
            });
        }

        $query->select([
            'attempts.id',
            'attempts.student_id',
            'attempts.attempt_no',
            'attempts.status',
            'attempts.started_at',
            'attempts.submitted_at',
            'attempts.cancelled_at',
            'attempts.cancel_reason',
            'attempts.risk_score',
            'attempts.risk_level',
            'attempts.duration_seconds',
            'attempts.created_at',
            'quizzes.title as quiz_title',
            'quizzes.id as quiz_id',
        ]);

        if ($hasUsers && Schema::hasColumn('users', 'full_name')) {
            $query->addSelect('users.full_name as student_name');
        }

        if ($hasRooms && Schema::hasColumn('rooms', 'name')) {
            $query->addSelect('rooms.name as room_name');
        }

        if ($hasQuizResults) {
            $query->addSelect('attempt_scores.total_score as total_score');
        }

        $rows = $query
            ->orderByDesc('attempts.created_at')
            ->limit($limit)
            ->get();

        $attempts = $rows
            ->map(function ($row): array {
                $statusInfo = $this->mapStatus((string) ($row->status ?? 'in_progress'));
                $studentName = trim((string) ($row->student_name ?? ''));

                return [
                    'id' => (int) $row->id,
                    'quiz_id' => (int) ($row->quiz_id ?? 0),
                    'quiz_title' => (string) ($row->quiz_title ?? 'Quiz'),
                    'student_id' => (string) ($row->student_id ?? ''),
                    'student_name' => $studentName !== '' ? $studentName : ('Student #'.(string) ($row->student_id ?? '')),
                    'attempt_no' => (int) ($row->attempt_no ?? 1),
                    'status' => $statusInfo['key'],
                    'status_label' => $statusInfo['label'],
                    'cancel_reason' => (string) ($row->cancel_reason ?? ''),
                    'risk_level' => (string) ($row->risk_level ?? 'low'),
                    'risk_score' => (float) ($row->risk_score ?? 0),
                    'score' => isset($row->total_score) ? (float) $row->total_score : null,
                    'duration_seconds' => $row->duration_seconds !== null ? (int) $row->duration_seconds : null,
                    'room_name' => (string) ($row->room_name ?? ''),
                    'started_at' => $row->started_at ? (string) $row->started_at : null,
                    'submitted_at' => $row->submitted_at ? (string) $row->submitted_at : null,
                    'cancelled_at' => $row->cancelled_at ? (string) $row->cancelled_at : null,
                    'created_at' => (string) ($row->created_at ?? ''),
                ];
            })
            ->values()
            ->all();

        return response()->json([
            'attempts' => $attempts,
            'summary' => $summary,
        ]);
    }

    private function isAdmin(Request $request): bool
    {
        $roleName = strtolower((string) ($request->user()?->role?->name ?? ''));
        return $roleName === 'admin';
    }

    private function applyStatusFilter(Builder $query, string $status): void
    {
        if ($status === 'ongoing') {
            $query->where('attempts.status', 'in_progress');
            return;
        }

        if ($status === 'cancelled') {
            $query->where('attempts.status', 'cancelled');
            return;
        }

        if ($status === 'submitted') {
            $query->where('attempts.status', 'submitted');
            return;
        }

        if ($status === 'completed') {
            $query->whereIn('attempts.status', ['submitted', 'expired']);
        }
    }

    /**
     * @return array{key: string, label: string}
     */
    private function mapStatus(string $status): array
    {
        $normalized = strtolower(trim($status));

        if ($normalized === 'submitted') {
            return ['key' => 'submitted', 'label' => 'Submitted'];
        }

        if ($normalized === 'cancelled') {
            return ['key' => 'cancelled', 'label' => 'Cancelled'];
        }

        if ($normalized === 'expired') {
            return ['key' => 'completed', 'label' => 'Completed'];
        }

        if ($normalized === 'in_progress') {
            return ['key' => 'ongoing', 'label' => 'Ongoing'];
        }

        return ['key' => $normalized !== '' ? $normalized : 'ongoing', 'label' => ucfirst($normalized !== '' ? $normalized : 'ongoing')];
    }

    /**
     * @return array<string, int>
     */
    private function summaryFromQuery(Builder $query): array
    {
        $row = $query
            ->selectRaw('COUNT(*) as total_count')
            ->selectRaw("SUM(CASE WHEN attempts.status = 'in_progress' THEN 1 ELSE 0 END) as ongoing_count")
            ->selectRaw("SUM(CASE WHEN attempts.status = 'submitted' THEN 1 ELSE 0 END) as submitted_count")
            ->selectRaw("SUM(CASE WHEN attempts.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count")
            ->selectRaw("SUM(CASE WHEN attempts.status = 'expired' THEN 1 ELSE 0 END) as expired_count")
            ->first();

        $submitted = (int) ($row->submitted_count ?? 0);
        $expired = (int) ($row->expired_count ?? 0);

        return [
            'total' => (int) ($row->total_count ?? 0),
            'ongoing' => (int) ($row->ongoing_count ?? 0),
            'submitted' => $submitted,
            'cancelled' => (int) ($row->cancelled_count ?? 0),
            'expired' => $expired,
            'completed' => $submitted + $expired,
        ];
    }

    /**
     * @return array<string, int>
     */
    private function emptySummary(): array
    {
        return [
            'total' => 0,
            'ongoing' => 0,
            'submitted' => 0,
            'cancelled' => 0,
            'expired' => 0,
            'completed' => 0,
        ];
    }
}
