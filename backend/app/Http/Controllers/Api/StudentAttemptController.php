<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class StudentAttemptController extends Controller
{
    public function availableQuizzes(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'student_id' => ['required', 'string', 'max:50'],
            'student_name' => ['required', 'string', 'max:150'],
        ]);

        if (
            !Schema::hasTable('room_members') ||
            !Schema::hasTable('quizzes') ||
            !Schema::hasTable('questions')
        ) {
            return response()->json([
                'quizzes' => [],
            ]);
        }

        $studentId = trim((string) $validated['student_id']);
        $studentName = trim((string) $validated['student_name']);
        $roomIds = $this->resolveStudentRoomIds($studentId, $studentName);

        if (empty($roomIds)) {
            return response()->json([
                'quizzes' => [],
            ]);
        }

        $studentUserId = $this->findStudentUserId($studentId);

        $rows = DB::table('quizzes')
            ->leftJoin('rooms', 'rooms.id', '=', 'quizzes.room_id')
            ->whereIn('quizzes.room_id', $roomIds)
            ->where('quizzes.status', 'published')
            ->select([
                'quizzes.id',
                'quizzes.title',
                'quizzes.description',
                'quizzes.room_id',
                'quizzes.time_limit_seconds',
                'quizzes.max_attempts',
                'quizzes.created_at',
                'rooms.name as room_name',
                DB::raw('(SELECT COUNT(*) FROM questions WHERE questions.quiz_id = quizzes.id) as question_count'),
            ])
            ->orderByDesc('quizzes.id')
            ->get();

        $quizzes = $rows
            ->map(function ($row) use ($studentUserId): array {
                $attemptsUsed = 0;
                $activeAttempt = null;
                if ($studentUserId) {
                    $attemptsUsed = (int) DB::table('attempts')
                        ->where('quiz_id', (int) $row->id)
                        ->where('student_id', $studentUserId)
                        ->count();

                    $activeAttempt = DB::table('attempts')
                        ->where('quiz_id', (int) $row->id)
                        ->where('student_id', $studentUserId)
                        ->where('status', 'in_progress')
                        ->orderByDesc('id')
                        ->first(['id', 'attempt_no', 'started_at']);
                }

                $maxAttempts = (int) ($row->max_attempts ?? 0);
                $remainingAttempts = $maxAttempts > 0
                    ? max($maxAttempts - $attemptsUsed, 0)
                    : null;

                $activeAttemptTimer = $activeAttempt
                    ? $this->buildTimerPayload($activeAttempt, (int) ($row->time_limit_seconds ?? 0))
                    : null;

                return [
                    'id' => (int) $row->id,
                    'title' => (string) ($row->title ?? 'Untitled Quiz'),
                    'description' => (string) ($row->description ?? ''),
                    'room_id' => $row->room_id ? (int) $row->room_id : null,
                    'room_name' => (string) ($row->room_name ?? ''),
                    'question_count' => (int) ($row->question_count ?? 0),
                    'time_limit_seconds' => $row->time_limit_seconds !== null ? (int) $row->time_limit_seconds : null,
                    'max_attempts' => $maxAttempts,
                    'attempts_used' => $attemptsUsed,
                    'remaining_attempts' => $remainingAttempts,
                    'active_attempt' => $activeAttempt ? [
                        'id' => (int) $activeAttempt->id,
                        'attempt_no' => (int) ($activeAttempt->attempt_no ?? 1),
                        'started_at' => (string) ($activeAttempt->started_at ?? ''),
                        'timer' => $activeAttemptTimer,
                    ] : null,
                    'created_at' => (string) ($row->created_at ?? ''),
                ];
            })
            ->values()
            ->all();

        if ($studentUserId) {
            ActivityLogger::log($studentUserId, 'student.quiz.list.opened', 'quiz');
        }

        return response()->json([
            'quizzes' => $quizzes,
        ]);
    }

    public function showQuiz(Request $request, int $quizId): JsonResponse
    {
        $validated = $request->validate([
            'student_id' => ['required', 'string', 'max:50'],
            'student_name' => ['required', 'string', 'max:150'],
        ]);

        $studentId = trim((string) $validated['student_id']);
        $studentName = trim((string) $validated['student_name']);

        $quiz = $this->resolveAccessiblePublishedQuiz($quizId, $studentId, $studentName);
        if (!$quiz) {
            return response()->json([
                'message' => 'Quiz not found or access denied.',
            ], 404);
        }

        if (!Schema::hasTable('attempts') || !Schema::hasTable('quiz_sessions')) {
            return response()->json([
                'message' => 'Attempt tables are not configured.',
            ], 500);
        }

        $questions = $this->loadQuizQuestions((int) $quiz->id);
        $studentUserId = $this->resolveStudentUserId($studentId, $studentName);

        try {
            $attempt = $this->resolveOrStartAttempt($quiz, $studentUserId);
        } catch (\RuntimeException $exception) {
            return response()->json([
                'message' => $exception->getMessage(),
            ], 422);
        }

        $timer = $this->buildTimerPayload($attempt, (int) ($quiz->time_limit_seconds ?? 0));
        ActivityLogger::log(
            $studentUserId,
            'student.quiz.opened',
            'quiz',
            (int) $quiz->id,
            (int) ($quiz->instructor_id ?? 0)
        );

        return response()->json([
            'quiz' => [
                'id' => (int) $quiz->id,
                'title' => (string) ($quiz->title ?? 'Untitled Quiz'),
                'description' => (string) ($quiz->description ?? ''),
                'time_limit_seconds' => $quiz->time_limit_seconds !== null ? (int) $quiz->time_limit_seconds : null,
                'max_attempts' => (int) ($quiz->max_attempts ?? 0),
                'room_name' => (string) ($quiz->room_name ?? ''),
                'questions' => $questions,
                'attempt' => [
                    'id' => (int) $attempt->id,
                    'attempt_no' => (int) ($attempt->attempt_no ?? 1),
                    'status' => (string) ($attempt->status ?? 'in_progress'),
                    'started_at' => (string) ($attempt->started_at ?? ''),
                    'server_time' => now()->toDateTimeString(),
                    'timer' => $timer,
                ],
            ],
        ]);
    }

    public function submitAttempt(Request $request, int $quizId): JsonResponse
    {
        $validated = $request->validate([
            'student_id' => ['required', 'string', 'max:50'],
            'student_name' => ['required', 'string', 'max:150'],
            'attempt_id' => ['required', 'integer'],
            'answers' => ['required', 'array', 'min:1'],
            'answers.*.question_id' => ['required', 'integer'],
            'answers.*.answer_text' => ['nullable', 'string', 'max:5000'],
            'answers.*.selected_option_id' => ['nullable', 'integer'],
            'answers.*.selected_option_ids' => ['nullable', 'array'],
            'answers.*.selected_option_ids.*' => ['integer'],
        ]);

        if (
            !Schema::hasTable('attempts') ||
            !Schema::hasTable('attempt_answers') ||
            !Schema::hasTable('attempt_answer_options') ||
            !Schema::hasTable('quiz_results') ||
            !Schema::hasTable('quiz_sessions')
        ) {
            return response()->json([
                'message' => 'Attempt tables are not configured.',
            ], 500);
        }

        $studentId = trim((string) $validated['student_id']);
        $studentName = trim((string) $validated['student_name']);

        $quiz = $this->resolveAccessiblePublishedQuiz($quizId, $studentId, $studentName);
        if (!$quiz) {
            return response()->json([
                'message' => 'Quiz not found or access denied.',
            ], 404);
        }

        if (!$quiz->room_id) {
            return response()->json([
                'message' => 'Quiz is not assigned to a room.',
            ], 422);
        }

        $questions = $this->loadQuizQuestions((int) $quiz->id, true);
        if (empty($questions)) {
            return response()->json([
                'message' => 'Quiz has no questions.',
            ], 422);
        }

        $studentUserId = $this->resolveStudentUserId($studentId, $studentName);
        $attemptId = (int) ($validated['attempt_id'] ?? 0);
        $attempt = DB::table('attempts')
            ->where('id', $attemptId)
            ->where('quiz_id', (int) $quiz->id)
            ->where('student_id', $studentUserId)
            ->first();

        if (!$attempt) {
            return response()->json([
                'message' => 'Attempt not found for this student and quiz.',
            ], 404);
        }

        $attemptStatus = strtolower((string) ($attempt->status ?? 'in_progress'));
        if (in_array($attemptStatus, ['submitted', 'expired'], true)) {
            $existingResult = DB::table('quiz_results')
                ->where('attempt_id', (int) $attempt->id)
                ->first();

            return response()->json([
                'message' => 'Attempt was already submitted.',
                'result' => [
                    'attempt_id' => (int) $attempt->id,
                    'attempt_no' => (int) ($attempt->attempt_no ?? 1),
                    'total_score' => $existingResult ? (float) ($existingResult->total_score ?? 0) : 0,
                    'status' => $attemptStatus,
                ],
            ]);
        }

        $answersByQuestion = [];
        foreach ($validated['answers'] as $answerPayload) {
            $questionId = (int) ($answerPayload['question_id'] ?? 0);
            if ($questionId <= 0) {
                continue;
            }
            $answersByQuestion[$questionId] = $answerPayload;
        }

        $timeLimitSeconds = (int) ($quiz->time_limit_seconds ?? 0);
        $elapsedSeconds = $this->elapsedSeconds((string) ($attempt->started_at ?? now()));
        $isExpiredByTimer = $timeLimitSeconds > 0 && $elapsedSeconds >= $timeLimitSeconds;
        $finalStatus = $isExpiredByTimer ? 'expired' : 'submitted';
        $now = now();

        $result = DB::transaction(function () use (
            $quiz,
            $attempt,
            $finalStatus,
            $now,
            $elapsedSeconds,
            $questions,
            $answersByQuestion
        ): array {
            $attemptId = (int) $attempt->id;

            $totalScore = 0.0;
            $totalPossible = 0.0;
            $answeredCount = 0;

            foreach ($questions as $question) {
                $questionId = (int) $question['id'];
                $questionType = (string) $question['question_type'];
                $points = (float) $question['points'];
                $totalPossible += $points;

                $payload = $answersByQuestion[$questionId] ?? [];
                $answerText = trim((string) ($payload['answer_text'] ?? ''));
                $rawSelectedOptionId = isset($payload['selected_option_id']) ? (int) $payload['selected_option_id'] : null;
                $rawSelectedOptionIds = $payload['selected_option_ids'] ?? [];

                $validOptionIds = collect($question['options'] ?? [])->pluck('id')->map(fn ($id) => (int) $id)->all();
                $selectedOptionIds = [];

                if ($rawSelectedOptionId && in_array($rawSelectedOptionId, $validOptionIds, true)) {
                    $selectedOptionIds[] = $rawSelectedOptionId;
                }

                if (is_array($rawSelectedOptionIds)) {
                    foreach ($rawSelectedOptionIds as $optionId) {
                        $castedOptionId = (int) $optionId;
                        if ($castedOptionId > 0 && in_array($castedOptionId, $validOptionIds, true)) {
                            $selectedOptionIds[] = $castedOptionId;
                        }
                    }
                }

                $selectedOptionIds = array_values(array_unique($selectedOptionIds));
                $selectedOptionId = $selectedOptionIds[0] ?? null;

                if ($answerText !== '' || !empty($selectedOptionIds)) {
                    $answeredCount++;
                }

                $correctOptionIds = collect($question['options'] ?? [])
                    ->filter(fn ($option) => !empty($option['is_correct']))
                    ->pluck('id')
                    ->map(fn ($id) => (int) $id)
                    ->values()
                    ->all();

                sort($selectedOptionIds);
                $sortedCorrectOptionIds = $correctOptionIds;
                sort($sortedCorrectOptionIds);

                $isCorrect = false;

                if ($questionType === 'mcq_multi') {
                    $isCorrect = !empty($selectedOptionIds) && $selectedOptionIds === $sortedCorrectOptionIds;
                } elseif ($questionType === 'mcq_single' || $questionType === 'true_false') {
                    $isCorrect = count($selectedOptionIds) === 1
                        && in_array($selectedOptionIds[0], $sortedCorrectOptionIds, true);
                } else {
                    $normalizedAnswer = $this->normalizeText($answerText);
                    if ($normalizedAnswer !== '') {
                        $correctTexts = collect($question['options'] ?? [])
                            ->filter(fn ($option) => !empty($option['is_correct']))
                            ->pluck('option_text')
                            ->map(fn ($text) => $this->normalizeText((string) $text))
                            ->filter()
                            ->values()
                            ->all();
                        $isCorrect = in_array($normalizedAnswer, $correctTexts, true);
                    }
                }

                $scoreAwarded = $isCorrect ? $points : 0.0;
                $totalScore += $scoreAwarded;

                $existingAnswerId = DB::table('attempt_answers')
                    ->where('attempt_id', $attemptId)
                    ->where('question_id', $questionId)
                    ->value('id');

                if ($existingAnswerId) {
                    DB::table('attempt_answers')
                        ->where('id', (int) $existingAnswerId)
                        ->update([
                            'answer_text' => $answerText !== '' ? $answerText : null,
                            'selected_option_id' => $selectedOptionId,
                            'score_awarded' => $scoreAwarded,
                            'is_correct' => $isCorrect ? 1 : 0,
                            'answered_at' => $now,
                            'updated_at' => $now,
                        ]);

                    $attemptAnswerId = (int) $existingAnswerId;
                } else {
                    $attemptAnswerId = (int) DB::table('attempt_answers')->insertGetId([
                        'attempt_id' => $attemptId,
                        'question_id' => $questionId,
                        'answer_text' => $answerText !== '' ? $answerText : null,
                        'selected_option_id' => $selectedOptionId,
                        'score_awarded' => $scoreAwarded,
                        'is_correct' => $isCorrect ? 1 : 0,
                        'answered_at' => $now,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                }

                DB::table('attempt_answer_options')
                    ->where('attempt_answer_id', $attemptAnswerId)
                    ->delete();

                if (!empty($selectedOptionIds)) {
                    $optionRows = array_map(static fn (int $optionId): array => [
                        'attempt_answer_id' => $attemptAnswerId,
                        'option_id' => $optionId,
                        'created_at' => $now,
                    ], $selectedOptionIds);

                    DB::table('attempt_answer_options')->insert($optionRows);
                }
            }

            DB::table('quiz_results')->updateOrInsert(
                ['attempt_id' => $attemptId],
                ['total_score' => $totalScore, 'created_at' => $now]
            );

            DB::table('attempts')
                ->where('id', $attemptId)
                ->update([
                    'status' => $finalStatus,
                    'submitted_at' => $now,
                    'duration_seconds' => $elapsedSeconds,
                    'updated_at' => $now,
                ]);

            return [
                'attempt_id' => $attemptId,
                'attempt_no' => (int) ($attempt->attempt_no ?? 1),
                'total_score' => round($totalScore, 2),
                'total_possible' => round($totalPossible, 2),
                'question_count' => count($questions),
                'answered_count' => $answeredCount,
                'status' => $finalStatus,
                'duration_seconds' => $elapsedSeconds,
            ];
        });

        ActivityLogger::log(
            $studentUserId,
            $finalStatus === 'expired' ? 'student.attempt.expired' : 'student.attempt.submitted',
            'attempt',
            (int) $attempt->id,
            (int) ($quiz->instructor_id ?? 0)
        );

        return response()->json([
            'message' => $finalStatus === 'expired'
                ? 'Time expired. Attempt saved as expired.'
                : 'Attempt submitted successfully.',
            'result' => $result,
        ], 200);
    }

    public function storeProctorEvent(Request $request, int $attemptId): JsonResponse
    {
        $validated = $request->validate([
            'student_id' => ['required', 'string', 'max:50'],
            'student_name' => ['required', 'string', 'max:150'],
            'event' => ['required', Rule::in(['tab_switch', 'window_blur'])],
            'meta' => ['nullable', 'array'],
        ]);

        if (!Schema::hasTable('attempts')) {
            return response()->json([
                'message' => 'Attempt tables are not configured.',
            ], 500);
        }

        $studentId = trim((string) $validated['student_id']);
        $studentName = trim((string) $validated['student_name']);

        try {
            $studentUserId = $this->resolveStudentUserId($studentId, $studentName);
        } catch (\RuntimeException $exception) {
            return response()->json([
                'message' => $exception->getMessage(),
            ], 500);
        }

        $attempt = DB::table('attempts')
            ->where('id', $attemptId)
            ->where('student_id', $studentUserId)
            ->first();

        if (!$attempt) {
            return response()->json([
                'message' => 'Attempt not found.',
            ], 404);
        }

        $attemptStatus = strtolower((string) ($attempt->status ?? 'in_progress'));
        if ($attemptStatus !== 'in_progress') {
            return response()->json([
                'message' => 'Attempt is not active.',
            ], 422);
        }

        $event = (string) $validated['event'];
        $scoreDelta = $event === 'tab_switch' ? 5.0 : 3.0;
        $severity = 'warning';
        $now = now();

        $result = DB::transaction(function () use ($attemptId, $attempt, $studentUserId, $event, $severity, $scoreDelta, $validated, $request, $now): array {
            if (Schema::hasTable('proctor_events')) {
                $payload = [];

                if (Schema::hasColumn('proctor_events', 'attempt_id')) {
                    $payload['attempt_id'] = $attemptId;
                }

                if (Schema::hasColumn('proctor_events', 'quiz_id') && isset($attempt->quiz_id)) {
                    $payload['quiz_id'] = (int) $attempt->quiz_id;
                }

                if (Schema::hasColumn('proctor_events', 'student_id')) {
                    $payload['student_id'] = $studentUserId;
                }

                if (Schema::hasColumn('proctor_events', 'event_type')) {
                    $payload['event_type'] = $event;
                } elseif (Schema::hasColumn('proctor_events', 'event')) {
                    $payload['event'] = $event;
                } elseif (Schema::hasColumn('proctor_events', 'action')) {
                    $payload['action'] = $event;
                }

                if (Schema::hasColumn('proctor_events', 'severity')) {
                    $payload['severity'] = $severity;
                }

                if (Schema::hasColumn('proctor_events', 'meta')) {
                    $payload['meta'] = json_encode($validated['meta'] ?? [], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
                }

                if (Schema::hasColumn('proctor_events', 'ip_address')) {
                    $payload['ip_address'] = (string) ($request->ip() ?? '');
                }

                if (Schema::hasColumn('proctor_events', 'user_agent')) {
                    $payload['user_agent'] = Str::limit((string) $request->userAgent(), 255, '');
                }

                if (Schema::hasColumn('proctor_events', 'occurred_at')) {
                    $payload['occurred_at'] = $now;
                }

                if (Schema::hasColumn('proctor_events', 'created_at')) {
                    $payload['created_at'] = $now;
                }

                if (Schema::hasColumn('proctor_events', 'updated_at')) {
                    $payload['updated_at'] = $now;
                }

                if (!empty($payload)) {
                    DB::table('proctor_events')->insert($payload);
                }
            }

            $lockedAttempt = DB::table('attempts')
                ->where('id', $attemptId)
                ->lockForUpdate()
                ->first(['risk_score']);

            $currentScore = (float) ($lockedAttempt->risk_score ?? 0);
            $nextScore = $currentScore + $scoreDelta;
            $nextLevel = $nextScore >= 20 ? 'high' : ($nextScore >= 10 ? 'medium' : 'low');

            $updatePayload = [
                'updated_at' => $now,
            ];

            if (Schema::hasColumn('attempts', 'risk_score')) {
                $updatePayload['risk_score'] = $nextScore;
            }

            if (Schema::hasColumn('attempts', 'risk_level')) {
                $updatePayload['risk_level'] = $nextLevel;
            }

            DB::table('attempts')
                ->where('id', $attemptId)
                ->update($updatePayload);

            return [
                'risk_score' => round($nextScore, 2),
                'risk_level' => $nextLevel,
            ];
        });

        ActivityLogger::log(
            $studentUserId,
            'proctor.'.$event,
            'attempt',
            (int) $attemptId,
            isset($attempt->quiz_id) ? (int) DB::table('quizzes')->where('id', (int) $attempt->quiz_id)->value('instructor_id') : null
        );

        return response()->json([
            'ok' => true,
            'risk_score' => $result['risk_score'],
            'risk_level' => $result['risk_level'],
        ]);
    }

    private function resolveOrStartAttempt(object $quiz, int $studentUserId): object
    {
        $timeLimitSeconds = (int) ($quiz->time_limit_seconds ?? 0);

        $activeAttempt = DB::table('attempts')
            ->where('quiz_id', (int) $quiz->id)
            ->where('student_id', $studentUserId)
            ->where('status', 'in_progress')
            ->orderByDesc('id')
            ->first();

        if ($activeAttempt && $timeLimitSeconds > 0) {
            $elapsedSeconds = $this->elapsedSeconds((string) ($activeAttempt->started_at ?? now()));
            if ($elapsedSeconds >= $timeLimitSeconds) {
                DB::table('attempts')
                    ->where('id', (int) $activeAttempt->id)
                    ->update([
                        'status' => 'expired',
                        'submitted_at' => now(),
                        'duration_seconds' => $elapsedSeconds,
                        'updated_at' => now(),
                    ]);

                ActivityLogger::log(
                    $studentUserId,
                    'student.attempt.expired',
                    'attempt',
                    (int) $activeAttempt->id,
                    (int) ($quiz->instructor_id ?? 0)
                );

                $activeAttempt = null;
            }
        }

        if ($activeAttempt) {
            ActivityLogger::log(
                $studentUserId,
                'student.attempt.resumed',
                'attempt',
                (int) $activeAttempt->id,
                (int) ($quiz->instructor_id ?? 0)
            );

            return $activeAttempt;
        }

        $totalAttempts = (int) DB::table('attempts')
            ->where('quiz_id', (int) $quiz->id)
            ->where('student_id', $studentUserId)
            ->count();

        $maxAttempts = (int) ($quiz->max_attempts ?? 0);
        if ($maxAttempts > 0 && $totalAttempts >= $maxAttempts) {
            throw new \RuntimeException('Attempt limit reached for this quiz.');
        }

        $sessionId = $this->resolveActiveSessionId($quiz);
        $now = now();

        $attemptId = (int) DB::table('attempts')->insertGetId([
            'session_id' => $sessionId,
            'quiz_id' => (int) $quiz->id,
            'student_id' => $studentUserId,
            'attempt_no' => $totalAttempts + 1,
            'status' => 'in_progress',
            'started_at' => $now,
            'risk_score' => 0,
            'risk_level' => 'low',
            'ip_address' => request()->ip(),
            'user_agent' => Str::limit((string) request()->userAgent(), 255, ''),
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        ActivityLogger::log(
            $studentUserId,
            'student.attempt.started',
            'attempt',
            $attemptId,
            (int) ($quiz->instructor_id ?? 0)
        );

        return DB::table('attempts')->where('id', $attemptId)->first();
    }

    private function resolveStudentRoomIds(string $studentId, string $studentName): array
    {
        return DB::table('room_members')
            ->whereRaw('LOWER(TRIM(student_id)) = ?', [strtolower(trim($studentId))])
            ->whereRaw('LOWER(TRIM(student_name)) = ?', [strtolower(trim($studentName))])
            ->pluck('room_id')
            ->map(fn ($roomId) => (int) $roomId)
            ->filter(fn ($roomId) => $roomId > 0)
            ->values()
            ->all();
    }

    private function resolveAccessiblePublishedQuiz(int $quizId, string $studentId, string $studentName): ?object
    {
        if (!Schema::hasTable('quizzes') || !Schema::hasTable('room_members')) {
            return null;
        }

        $quiz = DB::table('quizzes')
            ->leftJoin('rooms', 'rooms.id', '=', 'quizzes.room_id')
            ->where('quizzes.id', $quizId)
            ->where('quizzes.status', 'published')
            ->select([
                'quizzes.id',
                'quizzes.title',
                'quizzes.description',
                'quizzes.room_id',
                'quizzes.instructor_id',
                'quizzes.max_attempts',
                'quizzes.time_limit_seconds',
                'rooms.name as room_name',
            ])
            ->first();

        if (!$quiz || !$quiz->room_id) {
            return null;
        }

        $isAssigned = DB::table('room_members')
            ->where('room_id', (int) $quiz->room_id)
            ->whereRaw('LOWER(TRIM(student_id)) = ?', [strtolower(trim($studentId))])
            ->whereRaw('LOWER(TRIM(student_name)) = ?', [strtolower(trim($studentName))])
            ->exists();

        return $isAssigned ? $quiz : null;
    }

    private function loadQuizQuestions(int $quizId, bool $includeCorrect = false): array
    {
        if (!Schema::hasTable('questions') || !Schema::hasTable('question_options')) {
            return [];
        }

        $questionRows = DB::table('questions')
            ->where('quiz_id', $quizId)
            ->orderBy('order_no')
            ->select([
                'id',
                'question_type',
                'prompt',
                'points',
                'order_no',
                'image_path',
                'video_url',
            ])
            ->get();

        if ($questionRows->isEmpty()) {
            return [];
        }

        $questionIds = $questionRows->pluck('id')->map(fn ($id) => (int) $id)->all();

        $optionRows = DB::table('question_options')
            ->whereIn('question_id', $questionIds)
            ->orderBy('order_no')
            ->select([
                'id',
                'question_id',
                'option_text',
                'is_correct',
                'order_no',
                'image_path',
            ])
            ->get()
            ->groupBy('question_id');

        return $questionRows
            ->map(function ($question) use ($optionRows, $includeCorrect): array {
                $questionOptions = collect($optionRows->get($question->id, []))
                    ->map(function ($option) use ($includeCorrect): array {
                        $payload = [
                            'id' => (int) $option->id,
                            'option_text' => (string) ($option->option_text ?? ''),
                            'order_no' => (int) ($option->order_no ?? 0),
                            'image_path' => (string) ($option->image_path ?? ''),
                        ];
                        if ($includeCorrect) {
                            $payload['is_correct'] = (bool) $option->is_correct;
                        }

                        return $payload;
                    })
                    ->values()
                    ->all();

                return [
                    'id' => (int) $question->id,
                    'question_type' => (string) $question->question_type,
                    'prompt' => (string) ($question->prompt ?? ''),
                    'points' => (float) ($question->points ?? 0),
                    'order_no' => (int) ($question->order_no ?? 0),
                    'image_path' => (string) ($question->image_path ?? ''),
                    'video_url' => (string) ($question->video_url ?? ''),
                    'options' => $questionOptions,
                ];
            })
            ->values()
            ->all();
    }

    private function findStudentUserId(string $studentIdentifier): ?int
    {
        if (!Schema::hasTable('users')) {
            return null;
        }

        $email = $this->buildStudentEmail($studentIdentifier);

        $userId = DB::table('users')
            ->whereRaw('LOWER(email) = ?', [strtolower($email)])
            ->value('id');

        return $userId ? (int) $userId : null;
    }

    private function resolveStudentUserId(string $studentIdentifier, string $studentName): int
    {
        if (!Schema::hasTable('users') || !Schema::hasTable('roles')) {
            throw new \RuntimeException('Users/roles tables are missing.');
        }

        $email = $this->buildStudentEmail($studentIdentifier);

        $selectColumns = ['id'];
        if (Schema::hasColumn('users', 'full_name')) {
            $selectColumns[] = 'full_name';
        }
        if (Schema::hasColumn('users', 'name')) {
            $selectColumns[] = 'name';
        }

        $existing = DB::table('users')
            ->whereRaw('LOWER(email) = ?', [strtolower($email)])
            ->select($selectColumns)
            ->first();

        if ($existing) {
            $currentName = trim((string) ($existing->full_name ?? $existing->name ?? ''));
            if ($currentName !== trim($studentName)) {
                $updatePayload = [
                    'updated_at' => now(),
                ];
                if (Schema::hasColumn('users', 'full_name')) {
                    $updatePayload['full_name'] = trim($studentName);
                }
                if (Schema::hasColumn('users', 'name')) {
                    $updatePayload['name'] = trim($studentName);
                }

                DB::table('users')
                    ->where('id', (int) $existing->id)
                    ->update($updatePayload);
            }

            return (int) $existing->id;
        }

        $studentRoleId = DB::table('roles')
            ->whereRaw('LOWER(name) = ?', ['student'])
            ->value('id');

        if (!$studentRoleId) {
            $rolePayload = [
                'name' => 'student',
                'created_at' => now(),
                'updated_at' => now(),
            ];
            if (Schema::hasColumn('roles', 'description')) {
                $rolePayload['description'] = 'Student';
            }
            $studentRoleId = DB::table('roles')->insertGetId($rolePayload);
        }

        $passwordHash = Hash::make(Str::random(40));
        $userPayload = [
            'role_id' => (int) $studentRoleId,
            'email' => $email,
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ];

        if (Schema::hasColumn('users', 'full_name')) {
            $userPayload['full_name'] = trim($studentName);
        }
        if (Schema::hasColumn('users', 'name')) {
            $userPayload['name'] = trim($studentName);
        }
        if (Schema::hasColumn('users', 'password_hash')) {
            $userPayload['password_hash'] = $passwordHash;
        }
        if (Schema::hasColumn('users', 'password')) {
            $userPayload['password'] = $passwordHash;
        }

        return (int) DB::table('users')->insertGetId($userPayload);
    }

    private function resolveActiveSessionId(object $quiz): int
    {
        $sessionId = DB::table('quiz_sessions')
            ->where('quiz_id', (int) $quiz->id)
            ->where('room_id', (int) $quiz->room_id)
            ->where('is_active', 1)
            ->orderByDesc('id')
            ->value('id');

        if ($sessionId) {
            return (int) $sessionId;
        }

        return (int) DB::table('quiz_sessions')->insertGetId([
            'quiz_id' => (int) $quiz->id,
            'room_id' => (int) $quiz->room_id,
            'started_by' => (int) $quiz->instructor_id,
            'start_at' => now(),
            'access_mode' => 'open',
            'is_active' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function buildStudentEmail(string $studentIdentifier): string
    {
        $normalized = strtolower(trim($studentIdentifier));
        $normalized = preg_replace('/[^a-z0-9._-]/', '', $normalized) ?? '';
        $normalized = trim($normalized, '.-_');

        if ($normalized === '') {
            $normalized = strtolower(Str::random(10));
        }

        $localPart = Str::limit($normalized, 120, '');

        return $localPart.'@student.justquiz.local';
    }

    private function normalizeText(string $value): string
    {
        $normalized = mb_strtolower(trim($value), 'UTF-8');
        $normalized = preg_replace('/\s+/', ' ', $normalized) ?? '';
        return trim($normalized);
    }

    private function elapsedSeconds(string $startedAt): int
    {
        $startedTimestamp = strtotime($startedAt);
        if (!$startedTimestamp) {
            return 0;
        }

        return max(time() - $startedTimestamp, 0);
    }

    private function buildTimerPayload(object $attempt, int $timeLimitSeconds): ?array
    {
        if ($timeLimitSeconds <= 0) {
            return null;
        }

        $startedAtRaw = (string) ($attempt->started_at ?? '');
        $startedTimestamp = strtotime($startedAtRaw);
        if (!$startedTimestamp) {
            return null;
        }

        $expiresTimestamp = $startedTimestamp + $timeLimitSeconds;
        $remainingSeconds = max($expiresTimestamp - time(), 0);
        $elapsedSeconds = max(time() - $startedTimestamp, 0);

        return [
            'started_at' => date('Y-m-d H:i:s', $startedTimestamp),
            'expires_at' => date('Y-m-d H:i:s', $expiresTimestamp),
            'remaining_seconds' => $remainingSeconds,
            'elapsed_seconds' => $elapsedSeconds,
            'time_limit_seconds' => $timeLimitSeconds,
            'is_expired' => $remainingSeconds <= 0,
            'server_time' => now()->toDateTimeString(),
        ];
    }
}
