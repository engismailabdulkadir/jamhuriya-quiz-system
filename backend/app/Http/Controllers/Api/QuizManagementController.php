<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Question;
use App\Models\QuestionOption;
use App\Models\Quiz;
use App\Models\QuizSetting;
use Illuminate\Database\QueryException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use RuntimeException;
use Throwable;

class QuizManagementController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['nullable', 'string', 'in:all,draft,published,archived'],
            'search' => ['nullable', 'string', 'max:200'],
        ]);

        $query = Quiz::query()->with(['instructor', 'settings']);
        $status = strtolower((string) ($validated['status'] ?? 'all'));
        $search = trim((string) ($validated['search'] ?? ''));

        $roleName = strtolower((string) ($request->user()?->role?->name ?? ''));
        $isAdmin = $roleName === 'admin';

        if (!$isAdmin) {
            $query->where('instructor_id', (int) $request->user()->id);
        }

        if ($status !== 'all') {
            $query->where('status', $status);
        }

        if ($search !== '') {
            $query->where(function ($builder) use ($search): void {
                $builder->where('title', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%");
            });
        }

        $rows = $query
            ->orderByDesc('id')
            ->get()
            ->map(fn (Quiz $quiz): array => $this->mapQuiz($quiz))
            ->values();

        return response()->json([
            'quizzes' => $rows,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate(array_merge([
            'title' => ['required', 'string', 'max:200'],
            'description' => ['nullable', 'string'],
            'room_id' => ['nullable', 'integer'],
            'instructor_id' => ['nullable', 'integer'],
            'time_limit_seconds' => ['nullable', 'integer', 'min:30'],
            'max_attempts' => ['nullable', 'integer', 'min:1', 'max:20'],
            'status' => ['nullable', Rule::in(['draft', 'published', 'archived'])],
            'shuffle_questions' => ['nullable', 'boolean'],
            'shuffle_options' => ['nullable', 'boolean'],
            'allow_back_navigation' => ['nullable', 'boolean'],
        ], $this->quizSettingValidationRules()));

        $roleName = strtolower((string) ($request->user()?->role?->name ?? ''));
        $isAdmin = $roleName === 'admin';

        $quiz = Quiz::query()->create([
            'title' => (string) $validated['title'],
            'description' => $validated['description'] ?? null,
            'room_id' => $validated['room_id'] ?? null,
            'instructor_id' => $isAdmin
                ? (int) ($validated['instructor_id'] ?? $request->user()->id)
                : (int) $request->user()->id,
            'time_limit_seconds' => $validated['time_limit_seconds'] ?? null,
            'max_attempts' => (int) ($validated['max_attempts'] ?? 1),
            'status' => (string) ($validated['status'] ?? 'draft'),
            'shuffle_questions' => (bool) ($validated['shuffle_questions'] ?? false),
            'shuffle_options' => (bool) ($validated['shuffle_options'] ?? false),
            'allow_back_navigation' => (bool) ($validated['allow_back_navigation'] ?? true),
        ]);

        QuizSetting::query()->updateOrCreate(
            ['quiz_id' => $quiz->id],
            $this->buildQuizSettingsPayload($validated, null, (bool) $quiz->allow_back_navigation)
        );

        $quiz->load(['instructor', 'settings']);

        return response()->json([
            'message' => 'Quiz created successfully.',
            'quiz' => $this->mapQuiz($quiz),
        ], 201);
    }

    public function show(Request $request, int $quizId): JsonResponse
    {
        $quiz = $this->resolveQuizForUser($request, $quizId);
        if (!$quiz) {
            return response()->json([
                'message' => 'Quiz not found.',
            ], 404);
        }

        $quiz->loadMissing(['instructor', 'settings', 'questions.options']);

        return response()->json([
            'quiz' => $this->mapQuiz($quiz, true),
        ]);
    }

    public function storeBlankQuiz(Request $request): JsonResponse
    {
        $validatedQuiz = $request->validate(array_merge([
            'title' => ['required', 'string', 'max:200'],
            'description' => ['required', 'string'],
            'room_id' => ['nullable', 'integer'],
            'instructor_id' => ['nullable', 'integer'],
            'time_limit_seconds' => ['required', 'integer', 'min:30'],
            'max_attempts' => ['required', 'integer', 'min:0', 'max:20'],
            'status' => ['nullable', Rule::in(['draft', 'published', 'archived'])],
            'shuffle_questions' => ['nullable', 'boolean'],
            'shuffle_options' => ['nullable', 'boolean'],
            'allow_back_navigation' => ['nullable', 'boolean'],
            'quiz_cover_image' => ['nullable', 'file', 'image', 'max:10240'],
            'quiz_cover_video_url' => ['nullable', 'string', 'max:1000'],
            'quiz_cover_video_file' => ['nullable', 'file', 'mimetypes:video/mp4,video/webm,video/quicktime,video/x-matroska', 'max:51200'],
            'questions_json' => ['required', 'string'],
        ], $this->quizSettingValidationRules()));

        $decodedQuestions = json_decode((string) $validatedQuiz['questions_json'], true);
        if (!is_array($decodedQuestions) || count($decodedQuestions) === 0) {
            return response()->json([
                'message' => 'At least one question is required.',
                'errors' => [
                    'questions_json' => ['Add at least one blank question before saving.'],
                ],
            ], 422);
        }

        $validator = Validator::make(
            ['questions' => $decodedQuestions],
            [
                'questions' => ['required', 'array', 'min:1'],
                'questions.*.question_type' => ['required', Rule::in(['mcq_single', 'true_false', 'short_answer'])],
                'questions.*.prompt' => ['required', 'string', 'max:5000'],
                'questions.*.points' => ['nullable', 'numeric', 'min:0.25', 'max:100'],
                'questions.*.explanation' => ['nullable', 'string', 'max:5000'],
                'questions.*.video_url' => ['nullable', 'string', 'max:1000'],
                'questions.*.options' => ['nullable', 'array'],
                'questions.*.options.*.text' => ['nullable', 'string', 'max:2000'],
                'questions.*.options.*.is_correct' => ['nullable', 'boolean'],
            ]
        );

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Question data is invalid.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $normalizedQuestions = [];
        $customErrors = [];

        foreach ($decodedQuestions as $index => $question) {
            if (!is_array($question)) {
                $customErrors["questions.{$index}"][] = 'Question format is invalid.';
                continue;
            }

            $type = strtolower((string) ($question['question_type'] ?? ''));
            $prompt = trim((string) ($question['prompt'] ?? ''));
            $points = (float) ($question['points'] ?? 1);
            $points = $points > 0 ? $points : 1.0;
            $explanation = trim((string) ($question['explanation'] ?? ''));
            $videoUrl = trim((string) ($question['video_url'] ?? ''));
            $rawOptions = is_array($question['options'] ?? null) ? $question['options'] : [];

            if ($prompt === '') {
                $customErrors["questions.{$index}.prompt"][] = 'Question prompt is required.';
                continue;
            }

            $options = [];
            if (in_array($type, ['mcq_single', 'true_false'], true)) {
                if ($type === 'true_false' && count($rawOptions) === 0) {
                    $rawOptions = [
                        ['text' => 'True', 'is_correct' => true],
                        ['text' => 'False', 'is_correct' => false],
                    ];
                }

                foreach ($rawOptions as $optionIndex => $option) {
                    $optionText = trim((string) data_get($option, 'text', ''));
                    if ($optionText === '') {
                        continue;
                    }
                    $options[] = [
                        'text' => $optionText,
                        'is_correct' => (bool) data_get($option, 'is_correct', false),
                        'order_no' => $optionIndex + 1,
                    ];
                }

                if (count($options) < 2) {
                    $customErrors["questions.{$index}.options"][] = 'At least 2 options are required.';
                    continue;
                }

                $correctIndexes = [];
                foreach ($options as $optionIndex => $option) {
                    if ($option['is_correct']) {
                        $correctIndexes[] = $optionIndex;
                    }
                }

                if (count($correctIndexes) === 0) {
                    $options[0]['is_correct'] = true;
                    $correctIndexes = [0];
                }

                if ($type === 'true_false' && count($correctIndexes) > 1) {
                    $firstCorrect = $correctIndexes[0];
                    foreach ($options as $optionIndex => $option) {
                        $options[$optionIndex]['is_correct'] = $optionIndex === $firstCorrect;
                    }
                }
            }

            $normalizedQuestions[] = [
                'question_type' => $type,
                'prompt' => $prompt,
                'points' => $points,
                'explanation' => $explanation !== '' ? $explanation : null,
                'video_url' => $videoUrl !== '' ? $videoUrl : null,
                'options' => $options,
            ];
        }

        if (!empty($customErrors)) {
            return response()->json([
                'message' => 'Question data is invalid.',
                'errors' => $customErrors,
            ], 422);
        }

        $roleName = strtolower((string) ($request->user()?->role?->name ?? ''));
        $isAdmin = $roleName === 'admin';

        $quiz = DB::transaction(function () use ($request, $validatedQuiz, $normalizedQuestions, $isAdmin) {
            $coverImageFile = $request->file('quiz_cover_image');
            $coverImagePath = $this->storePublicImage($coverImageFile, 'quiz-media/images/covers');
            $coverImageMeta = $this->buildStoredFileMeta($coverImageFile, $coverImagePath);

            $coverVideoFile = $request->file('quiz_cover_video_file');
            $coverVideoStored = $this->storePublicVideo($coverVideoFile, 'quiz-media/videos/covers');
            $coverVideoUrlInput = trim((string) ($validatedQuiz['quiz_cover_video_url'] ?? ''));
            $coverVideoUrl = $coverVideoStored['url'] ?? ($coverVideoUrlInput !== '' ? $coverVideoUrlInput : null);
            $coverVideoMeta = $coverVideoStored
                ? $this->buildStoredFileMeta($coverVideoFile, $coverVideoStored['path'], $coverVideoStored['url'])
                : $this->buildExternalVideoMeta($coverVideoUrlInput);

            $resolvedMaxAttempts = (int) $validatedQuiz['max_attempts'];
            $resolvedStatus = $resolvedMaxAttempts === 0
                ? 'archived'
                : (string) ($validatedQuiz['status'] ?? 'draft');

            $quiz = Quiz::query()->create([
                'title' => (string) $validatedQuiz['title'],
                'description' => (string) $validatedQuiz['description'],
                'cover_image_path' => $coverImagePath,
                'cover_image_meta' => $coverImageMeta,
                'cover_video_url' => $coverVideoUrl,
                'cover_video_meta' => $coverVideoMeta,
                'room_id' => $validatedQuiz['room_id'] ?? null,
                'instructor_id' => $isAdmin
                    ? (int) ($validatedQuiz['instructor_id'] ?? $request->user()->id)
                    : (int) $request->user()->id,
                'time_limit_seconds' => (int) $validatedQuiz['time_limit_seconds'],
                'max_attempts' => $resolvedMaxAttempts,
                'status' => $resolvedStatus,
                'shuffle_questions' => (bool) ($validatedQuiz['shuffle_questions'] ?? false),
                'shuffle_options' => (bool) ($validatedQuiz['shuffle_options'] ?? false),
                'allow_back_navigation' => (bool) ($validatedQuiz['allow_back_navigation'] ?? true),
            ]);

            QuizSetting::query()->updateOrCreate(
                ['quiz_id' => $quiz->id],
                $this->buildQuizSettingsPayload($validatedQuiz, null, (bool) $quiz->allow_back_navigation)
            );

            foreach ($normalizedQuestions as $questionIndex => $questionData) {
                $questionImageFile = $request->file("question_image_{$questionIndex}");
                $questionImagePath = $this->storePublicImage($questionImageFile, 'quiz-media/images/questions');
                $questionImageMeta = $this->buildStoredFileMeta($questionImageFile, $questionImagePath);

                $questionVideoFile = $request->file("question_video_{$questionIndex}");
                $questionVideoStored = $this->storePublicVideo($questionVideoFile, 'quiz-media/videos/questions');
                $questionVideoUrlInput = trim((string) ($questionData['video_url'] ?? ''));
                $questionVideoUrl = $questionVideoStored['url'] ?? ($questionVideoUrlInput !== '' ? $questionVideoUrlInput : null);
                $questionVideoMeta = $questionVideoStored
                    ? $this->buildStoredFileMeta($questionVideoFile, $questionVideoStored['path'], $questionVideoStored['url'])
                    : $this->buildExternalVideoMeta($questionVideoUrlInput);

                $question = Question::query()->create([
                    'quiz_id' => $quiz->id,
                    'question_type' => $questionData['question_type'],
                    'prompt' => $questionData['prompt'],
                    'points' => $questionData['points'],
                    'order_no' => $questionIndex + 1,
                    'explanation' => $questionData['explanation'],
                    'image_path' => $questionImagePath,
                    'image_meta' => $questionImageMeta,
                    'video_url' => $questionVideoUrl,
                    'video_meta' => $questionVideoMeta,
                ]);

                foreach ($questionData['options'] as $optionIndex => $optionData) {
                    $optionImageFile = $request->file("option_image_{$questionIndex}_{$optionIndex}");
                    $optionImagePath = $this->storePublicImage($optionImageFile, 'quiz-media/images/options');
                    $optionImageMeta = $this->buildStoredFileMeta($optionImageFile, $optionImagePath);

                    QuestionOption::query()->create([
                        'question_id' => $question->id,
                        'option_text' => $optionData['text'],
                        'is_correct' => (bool) $optionData['is_correct'],
                        'order_no' => $optionIndex + 1,
                        'image_path' => $optionImagePath,
                        'image_meta' => $optionImageMeta,
                    ]);
                }
            }

            return $quiz;
        });

        $quiz->load(['instructor', 'settings', 'questions.options']);

        return response()->json([
            'message' => 'Blank quiz created successfully.',
            'quiz' => $this->mapQuiz($quiz, true),
        ], 201);
    }

    public function update(Request $request, int $quizId): JsonResponse
    {
        $quiz = $this->resolveQuizForUser($request, $quizId);
        if (!$quiz) {
            return response()->json([
                'message' => 'Quiz not found.',
            ], 404);
        }

        $validated = $request->validate(array_merge([
            'title' => ['required', 'string', 'max:200'],
            'description' => ['nullable', 'string'],
            'room_id' => ['nullable', 'integer'],
            'instructor_id' => ['nullable', 'integer'],
            'time_limit_seconds' => ['nullable', 'integer', 'min:30'],
            'max_attempts' => ['nullable', 'integer', 'min:1', 'max:20'],
            'status' => ['nullable', Rule::in(['draft', 'published', 'archived'])],
            'shuffle_questions' => ['nullable', 'boolean'],
            'shuffle_options' => ['nullable', 'boolean'],
            'allow_back_navigation' => ['nullable', 'boolean'],
        ], $this->quizSettingValidationRules()));

        $roleName = strtolower((string) ($request->user()?->role?->name ?? ''));
        $isAdmin = $roleName === 'admin';

        $quiz->update([
            'title' => (string) $validated['title'],
            'description' => $validated['description'] ?? null,
            'room_id' => $validated['room_id'] ?? null,
            'instructor_id' => $isAdmin
                ? (int) ($validated['instructor_id'] ?? $quiz->instructor_id)
                : (int) $request->user()->id,
            'time_limit_seconds' => $validated['time_limit_seconds'] ?? null,
            'max_attempts' => (int) ($validated['max_attempts'] ?? 1),
            'status' => (string) ($validated['status'] ?? 'draft'),
            'shuffle_questions' => (bool) ($validated['shuffle_questions'] ?? false),
            'shuffle_options' => (bool) ($validated['shuffle_options'] ?? false),
            'allow_back_navigation' => (bool) ($validated['allow_back_navigation'] ?? true),
        ]);

        $quiz->loadMissing('settings');
        QuizSetting::query()->updateOrCreate(
            ['quiz_id' => $quiz->id],
            $this->buildQuizSettingsPayload($validated, $quiz->settings, (bool) $quiz->allow_back_navigation)
        );

        $quiz->refresh();
        $quiz->load(['instructor', 'settings', 'questions.options']);

        return response()->json([
            'message' => 'Quiz updated successfully.',
            'quiz' => $this->mapQuiz($quiz, true),
        ]);
    }

    public function updateBlankQuiz(Request $request, int $quizId): JsonResponse
    {
        $quiz = $this->resolveQuizForUser($request, $quizId);
        if (!$quiz) {
            return response()->json([
                'message' => 'Quiz not found.',
            ], 404);
        }

        $validatedQuiz = $request->validate(array_merge([
            'title' => ['required', 'string', 'max:200'],
            'description' => ['required', 'string'],
            'room_id' => ['nullable', 'integer'],
            'instructor_id' => ['nullable', 'integer'],
            'time_limit_seconds' => ['required', 'integer', 'min:30'],
            'max_attempts' => ['required', 'integer', 'min:0', 'max:20'],
            'status' => ['nullable', Rule::in(['draft', 'published', 'archived'])],
            'shuffle_questions' => ['nullable', 'boolean'],
            'shuffle_options' => ['nullable', 'boolean'],
            'allow_back_navigation' => ['nullable', 'boolean'],
            'quiz_cover_image' => ['nullable', 'file', 'image', 'max:10240'],
            'quiz_cover_video_url' => ['nullable', 'string', 'max:1000'],
            'quiz_cover_video_file' => ['nullable', 'file', 'mimetypes:video/mp4,video/webm,video/quicktime,video/x-matroska', 'max:51200'],
            'questions_json' => ['required', 'string'],
        ], $this->quizSettingValidationRules()));

        $decodedQuestions = json_decode((string) $validatedQuiz['questions_json'], true);
        if (!is_array($decodedQuestions) || count($decodedQuestions) === 0) {
            return response()->json([
                'message' => 'At least one question is required.',
                'errors' => [
                    'questions_json' => ['Add at least one blank question before saving.'],
                ],
            ], 422);
        }

        $validator = Validator::make(
            ['questions' => $decodedQuestions],
            [
                'questions' => ['required', 'array', 'min:1'],
                'questions.*.question_type' => ['required', Rule::in(['mcq_single', 'true_false', 'short_answer'])],
                'questions.*.prompt' => ['required', 'string', 'max:5000'],
                'questions.*.points' => ['nullable', 'numeric', 'min:0.25', 'max:100'],
                'questions.*.explanation' => ['nullable', 'string', 'max:5000'],
                'questions.*.video_url' => ['nullable', 'string', 'max:1000'],
                'questions.*.options' => ['nullable', 'array'],
                'questions.*.options.*.text' => ['nullable', 'string', 'max:2000'],
                'questions.*.options.*.is_correct' => ['nullable', 'boolean'],
            ]
        );

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Question data is invalid.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $normalizedQuestions = [];
        $customErrors = [];

        foreach ($decodedQuestions as $index => $question) {
            if (!is_array($question)) {
                $customErrors["questions.{$index}"][] = 'Question format is invalid.';
                continue;
            }

            $type = strtolower((string) ($question['question_type'] ?? ''));
            $prompt = trim((string) ($question['prompt'] ?? ''));
            $points = (float) ($question['points'] ?? 1);
            $points = $points > 0 ? $points : 1.0;
            $explanation = trim((string) ($question['explanation'] ?? ''));
            $videoUrl = trim((string) ($question['video_url'] ?? ''));
            $rawOptions = is_array($question['options'] ?? null) ? $question['options'] : [];

            if ($prompt === '') {
                $customErrors["questions.{$index}.prompt"][] = 'Question prompt is required.';
                continue;
            }

            $options = [];
            if (in_array($type, ['mcq_single', 'true_false'], true)) {
                if ($type === 'true_false' && count($rawOptions) === 0) {
                    $rawOptions = [
                        ['text' => 'True', 'is_correct' => true],
                        ['text' => 'False', 'is_correct' => false],
                    ];
                }

                foreach ($rawOptions as $optionIndex => $option) {
                    $optionText = trim((string) data_get($option, 'text', ''));
                    if ($optionText === '') {
                        continue;
                    }
                    $options[] = [
                        'text' => $optionText,
                        'is_correct' => (bool) data_get($option, 'is_correct', false),
                        'order_no' => $optionIndex + 1,
                    ];
                }

                if (count($options) < 2) {
                    $customErrors["questions.{$index}.options"][] = 'At least 2 options are required.';
                    continue;
                }

                $correctIndexes = [];
                foreach ($options as $optionIndex => $option) {
                    if ($option['is_correct']) {
                        $correctIndexes[] = $optionIndex;
                    }
                }

                if (count($correctIndexes) === 0) {
                    $options[0]['is_correct'] = true;
                    $correctIndexes = [0];
                }

                if ($type === 'true_false' && count($correctIndexes) > 1) {
                    $firstCorrect = $correctIndexes[0];
                    foreach ($options as $optionIndex => $option) {
                        $options[$optionIndex]['is_correct'] = $optionIndex === $firstCorrect;
                    }
                }
            }

            $normalizedQuestions[] = [
                'question_type' => $type,
                'prompt' => $prompt,
                'points' => $points,
                'explanation' => $explanation !== '' ? $explanation : null,
                'video_url' => $videoUrl !== '' ? $videoUrl : null,
                'options' => $options,
            ];
        }

        if (!empty($customErrors)) {
            return response()->json([
                'message' => 'Question data is invalid.',
                'errors' => $customErrors,
            ], 422);
        }

        $roleName = strtolower((string) ($request->user()?->role?->name ?? ''));
        $isAdmin = $roleName === 'admin';

        $quiz = DB::transaction(function () use ($request, $validatedQuiz, $normalizedQuestions, $quiz, $isAdmin) {
            $coverImageFile = $request->file('quiz_cover_image');
            $coverImagePath = $this->storePublicImage($coverImageFile, 'quiz-media/images/covers');
            $coverImageMeta = $coverImagePath
                ? $this->buildStoredFileMeta($coverImageFile, $coverImagePath)
                : $quiz->cover_image_meta;

            $coverVideoFile = $request->file('quiz_cover_video_file');
            $coverVideoStored = $this->storePublicVideo($coverVideoFile, 'quiz-media/videos/covers');
            $coverVideoUrlInput = trim((string) ($validatedQuiz['quiz_cover_video_url'] ?? ''));
            $coverVideoUrl = $coverVideoStored['url'] ?? ($coverVideoUrlInput !== '' ? $coverVideoUrlInput : $quiz->cover_video_url);
            $coverVideoMeta = $quiz->cover_video_meta;
            if ($coverVideoStored) {
                $coverVideoMeta = $this->buildStoredFileMeta($coverVideoFile, $coverVideoStored['path'], $coverVideoStored['url']);
            } elseif ($coverVideoUrlInput !== '') {
                $coverVideoMeta = $this->buildExternalVideoMeta($coverVideoUrlInput);
            }

            $resolvedMaxAttempts = (int) $validatedQuiz['max_attempts'];
            $resolvedStatus = $resolvedMaxAttempts === 0
                ? 'archived'
                : (string) ($validatedQuiz['status'] ?? $quiz->status ?? 'draft');

            $quiz->update([
                'title' => (string) $validatedQuiz['title'],
                'description' => (string) $validatedQuiz['description'],
                'cover_image_path' => $coverImagePath ?: $quiz->cover_image_path,
                'cover_image_meta' => $coverImageMeta,
                'cover_video_url' => $coverVideoUrl,
                'cover_video_meta' => $coverVideoMeta,
                'room_id' => array_key_exists('room_id', $validatedQuiz) ? ($validatedQuiz['room_id'] ?? null) : $quiz->room_id,
                'instructor_id' => $isAdmin
                    ? (int) ($validatedQuiz['instructor_id'] ?? $quiz->instructor_id)
                    : (int) $request->user()->id,
                'time_limit_seconds' => (int) $validatedQuiz['time_limit_seconds'],
                'max_attempts' => $resolvedMaxAttempts,
                'status' => $resolvedStatus,
                'shuffle_questions' => array_key_exists('shuffle_questions', $validatedQuiz)
                    ? (bool) $validatedQuiz['shuffle_questions']
                    : (bool) $quiz->shuffle_questions,
                'shuffle_options' => array_key_exists('shuffle_options', $validatedQuiz)
                    ? (bool) $validatedQuiz['shuffle_options']
                    : (bool) $quiz->shuffle_options,
                'allow_back_navigation' => array_key_exists('allow_back_navigation', $validatedQuiz)
                    ? (bool) $validatedQuiz['allow_back_navigation']
                    : (bool) $quiz->allow_back_navigation,
            ]);

            $quiz->loadMissing('settings');
            QuizSetting::query()->updateOrCreate(
                ['quiz_id' => $quiz->id],
                $this->buildQuizSettingsPayload($validatedQuiz, $quiz->settings, (bool) $quiz->allow_back_navigation)
            );

            Question::query()->where('quiz_id', $quiz->id)->delete();

            foreach ($normalizedQuestions as $questionIndex => $questionData) {
                $questionImageFile = $request->file("question_image_{$questionIndex}");
                $questionImagePath = $this->storePublicImage($questionImageFile, 'quiz-media/images/questions');
                $questionImageMeta = $this->buildStoredFileMeta($questionImageFile, $questionImagePath);

                $questionVideoFile = $request->file("question_video_{$questionIndex}");
                $questionVideoStored = $this->storePublicVideo($questionVideoFile, 'quiz-media/videos/questions');
                $questionVideoUrlInput = trim((string) ($questionData['video_url'] ?? ''));
                $questionVideoUrl = $questionVideoStored['url'] ?? ($questionVideoUrlInput !== '' ? $questionVideoUrlInput : null);
                $questionVideoMeta = $questionVideoStored
                    ? $this->buildStoredFileMeta($questionVideoFile, $questionVideoStored['path'], $questionVideoStored['url'])
                    : $this->buildExternalVideoMeta($questionVideoUrlInput);

                $question = Question::query()->create([
                    'quiz_id' => $quiz->id,
                    'question_type' => $questionData['question_type'],
                    'prompt' => $questionData['prompt'],
                    'points' => $questionData['points'],
                    'order_no' => $questionIndex + 1,
                    'explanation' => $questionData['explanation'],
                    'image_path' => $questionImagePath,
                    'image_meta' => $questionImageMeta,
                    'video_url' => $questionVideoUrl,
                    'video_meta' => $questionVideoMeta,
                ]);

                foreach ($questionData['options'] as $optionIndex => $optionData) {
                    $optionImageFile = $request->file("option_image_{$questionIndex}_{$optionIndex}");
                    $optionImagePath = $this->storePublicImage($optionImageFile, 'quiz-media/images/options');
                    $optionImageMeta = $this->buildStoredFileMeta($optionImageFile, $optionImagePath);

                    QuestionOption::query()->create([
                        'question_id' => $question->id,
                        'option_text' => $optionData['text'],
                        'is_correct' => (bool) $optionData['is_correct'],
                        'order_no' => $optionIndex + 1,
                        'image_path' => $optionImagePath,
                        'image_meta' => $optionImageMeta,
                    ]);
                }
            }

            $quiz->refresh();
            return $quiz;
        });

        $quiz->load(['instructor', 'settings', 'questions.options']);

        return response()->json([
            'message' => 'Blank quiz updated successfully.',
            'quiz' => $this->mapQuiz($quiz, true),
        ]);
    }

    public function destroy(Request $request, int $quizId): JsonResponse
    {
        $quiz = $this->resolveQuizForUser($request, $quizId);
        if (!$quiz) {
            return response()->json([
                'message' => 'Quiz not found.',
            ], 404);
        }

        $title = (string) $quiz->title;
        $quiz->delete();

        return response()->json([
            'message' => "Quiz \"{$title}\" deleted successfully.",
        ]);
    }

    public function generateWithAi(Request $request): JsonResponse
    {
        $validated = $request->validate(array_merge([
            'prompt' => ['nullable', 'string', 'max:3000'],
            'topic' => ['nullable', 'string', 'max:200'],
            'difficulty' => ['nullable', 'string', Rule::in(['easy', 'medium', 'hard', 'mixed'])],
            'question_count' => ['nullable', 'integer', 'min:1', 'max:30'],
            'question_type' => ['nullable', 'string', Rule::in(['mcq_single', 'true_false', 'mixed'])],
            'question_types' => ['nullable', 'array', 'min:1'],
            'question_types.*' => ['string', Rule::in(['mcq_single', 'true_false', 'short_answer'])],
            'generate_explanations' => ['nullable', 'boolean'],
            'language' => ['nullable', 'string', 'max:50'],
            'title' => ['nullable', 'string', 'max:200'],
            'description' => ['nullable', 'string'],
            'room_id' => ['nullable', 'integer'],
            'instructor_id' => ['nullable', 'integer'],
            'time_limit_seconds' => ['nullable', 'integer', 'min:30'],
            'max_attempts' => ['nullable', 'integer', 'min:1', 'max:20'],
            'status' => ['nullable', Rule::in(['draft', 'published', 'archived'])],
            'shuffle_questions' => ['nullable', 'boolean'],
            'shuffle_options' => ['nullable', 'boolean'],
            'allow_back_navigation' => ['nullable', 'boolean'],
            'context_file' => ['nullable', 'file', 'max:20480', 'mimes:pdf,csv,txt,md,json,jpg,jpeg,png'],
        ], $this->quizSettingValidationRules()));

        $promptText = trim((string) ($validated['prompt'] ?? ''));
        $topicText = trim((string) ($validated['topic'] ?? ''));
        $coverageText = $promptText !== '' ? $promptText : $topicText;

        if ($coverageText === '') {
            return response()->json([
                'message' => 'Prompt is required. Please describe what questions should cover.',
            ], 422);
        }

        $selectedTypes = data_get($validated, 'question_types', []);
        if (!is_array($selectedTypes)) {
            $selectedTypes = [];
        }

        $legacyType = strtolower((string) ($validated['question_type'] ?? ''));
        if (count($selectedTypes) === 0 && in_array($legacyType, ['mcq_single', 'true_false', 'short_answer'], true)) {
            $selectedTypes[] = $legacyType;
        }

        if (count($selectedTypes) === 0) {
            $selectedTypes = ['mcq_single', 'true_false', 'short_answer'];
        }

        try {
            $roleName = strtolower((string) ($request->user()?->role?->name ?? ''));
            $isAdmin = $roleName === 'admin';

            $fileContext = $this->extractFileContext($request->file('context_file'));
            $generatedQuestions = $this->generateQuestionsFromAi(
                $validated,
                $coverageText,
                $selectedTypes,
                (bool) ($validated['generate_explanations'] ?? true),
                $fileContext
            );
            if (count($generatedQuestions) === 0) {
                return response()->json([
                    'message' => 'AI did not return valid questions. Try improving the prompt details.',
                ], 422);
            }

            $quizTitle = trim((string) ($validated['title'] ?? ''));
            if ($quizTitle === '') {
                $difficulty = (string) ($validated['difficulty'] ?? 'mixed');
                $topicLabel = trim((string) ($validated['topic'] ?? 'AI Generated'));
                if ($topicLabel === '') {
                    $topicLabel = trim(substr($coverageText, 0, 40));
                }
                if ($topicLabel === '') {
                    $topicLabel = 'AI Generated';
                }
                $quizTitle = sprintf('%s Quiz (%s)', $topicLabel, ucfirst($difficulty));
            }

            $quiz = DB::transaction(function () use ($validated, $generatedQuestions, $request, $isAdmin, $quizTitle) {
                $quiz = Quiz::query()->create([
                    'title' => $quizTitle,
                    'description' => $validated['description'] ?? null,
                    'room_id' => $validated['room_id'] ?? null,
                    'instructor_id' => $isAdmin
                        ? (int) ($validated['instructor_id'] ?? $request->user()->id)
                        : (int) $request->user()->id,
                    'time_limit_seconds' => $validated['time_limit_seconds'] ?? null,
                    'max_attempts' => (int) ($validated['max_attempts'] ?? 1),
                    'status' => (string) ($validated['status'] ?? 'draft'),
                    'shuffle_questions' => (bool) ($validated['shuffle_questions'] ?? false),
                    'shuffle_options' => (bool) ($validated['shuffle_options'] ?? false),
                    'allow_back_navigation' => (bool) ($validated['allow_back_navigation'] ?? true),
                ]);

                QuizSetting::query()->updateOrCreate(
                    ['quiz_id' => $quiz->id],
                    $this->buildQuizSettingsPayload($validated, null, (bool) $quiz->allow_back_navigation)
                );

                foreach ($generatedQuestions as $index => $generated) {
                    $question = Question::query()->create([
                        'quiz_id' => $quiz->id,
                        'question_type' => $generated['question_type'],
                        'prompt' => $generated['prompt'],
                        'points' => $generated['points'],
                        'order_no' => $index + 1,
                        'explanation' => $generated['explanation'],
                    ]);

                    foreach ($generated['options'] as $optionIndex => $option) {
                        QuestionOption::query()->create([
                            'question_id' => $question->id,
                            'option_text' => $option['text'],
                            'is_correct' => (bool) $option['is_correct'],
                            'order_no' => $optionIndex + 1,
                        ]);
                    }
                }

                return $quiz;
            });

            $quiz->load(['instructor', 'settings', 'questions.options']);

            return response()->json([
                'message' => 'AI quiz generated successfully.',
                'quiz' => $this->mapQuiz($quiz, true),
            ], 201);
        } catch (QueryException $exception) {
            report($exception);

            return response()->json([
                'message' => 'Failed to save AI quiz in database. Run php artisan migrate and check quiz question tables.',
            ], 500);
        } catch (Throwable $exception) {
            report($exception);
            Log::error('AI quiz generation failed', [
                'error' => $exception->getMessage(),
            ]);

            return response()->json([
                'message' => $exception->getMessage() ?: 'AI generation failed.',
            ], 500);
        }
    }

    /**
     * @param  array<string, mixed>  $input
     * @param  array<int, string>  $selectedTypes
     * @return array<int, array{question_type:string,prompt:string,points:float,explanation:?string,options:array<int, array{text:string,is_correct:bool}>}>
     */
    private function generateQuestionsFromAi(
        array $input,
        string $coverageText,
        array $selectedTypes,
        bool $generateExplanations,
        string $fileContext
    ): array
    {
        $apiKey = (string) config('services.openai.api_key', '');
        $allowLocalFallback = (bool) config('services.openai.fallback_local', true);
        if ($apiKey === '') {
            if ($allowLocalFallback) {
                Log::warning('OPENAI_API_KEY missing. Using local question generator fallback.');

                return $this->generateQuestionsFromLocalRules($input, $coverageText, $selectedTypes, $generateExplanations, $fileContext);
            }

            throw new RuntimeException('OPENAI_API_KEY is missing in backend/.env');
        }

        $model = (string) config('services.openai.model', 'gpt-5.4');
        $baseUrl = rtrim((string) config('services.openai.base_url', 'https://api.openai.com/v1'), '/');
        $questionCount = (int) ($input['question_count'] ?? 10);
        $difficulty = (string) ($input['difficulty'] ?? 'mixed');
        $language = (string) ($input['language'] ?? 'English');
        $questionTypeList = implode(', ', $selectedTypes);
        $contextBlock = trim($fileContext);
        $explanationsMode = $generateExplanations ? 'true' : 'false';

        $systemPrompt = $this->resolveSystemPrompt();
        $userPrompt = <<<PROMPT
Generate {$questionCount} quiz questions based on this prompt:
{$coverageText}

Difficulty: {$difficulty}
Allowed question types: {$questionTypeList}
Language: {$language}
Generate explanations: {$explanationsMode}

Rules:
- Return unique and practical questions.
- Keep prompts clear and concise.
- For MCQ/True-False include options and one correct answer.
- For short_answer provide a concise correct_answer and keep options empty.
- points should be between 1 and 5.
PROMPT;

        if ($contextBlock !== '') {
            $userPrompt .= "\n\nAdditional file context:\n{$contextBlock}";
        }

        $schema = [
            'type' => 'object',
            'properties' => [
                'questions' => [
                    'type' => 'array',
                    'minItems' => 1,
                    'maxItems' => 30,
                    'items' => [
                        'type' => 'object',
                        'properties' => [
                            'question_type' => [
                                'type' => 'string',
                                'enum' => ['mcq_single', 'true_false', 'short_answer'],
                            ],
                            'prompt' => ['type' => 'string'],
                            'options' => [
                                'type' => 'array',
                                'minItems' => 0,
                                'maxItems' => 6,
                                'items' => ['type' => 'string'],
                            ],
                            'correct_answer' => ['type' => 'string'],
                            'explanation' => ['type' => 'string'],
                            'points' => ['type' => 'number'],
                        ],
                        'required' => ['question_type', 'prompt', 'options', 'correct_answer', 'points'],
                        'additionalProperties' => false,
                    ],
                ],
            ],
            'required' => ['questions'],
            'additionalProperties' => false,
        ];

        $connectTimeout = max((int) config('services.openai.connect_timeout', 30), 5);
        $requestTimeout = max((int) config('services.openai.timeout', 120), 10);
        $retryTimes = max((int) config('services.openai.retry_times', 2), 0);
        $retrySleepMs = max((int) config('services.openai.retry_sleep_ms', 700), 0);
        $forceIpv4 = (bool) config('services.openai.force_ipv4', true);

        $requestClient = Http::connectTimeout($connectTimeout)
            ->timeout($requestTimeout)
            ->retry($retryTimes, $retrySleepMs, null, false)
            ->acceptJson()
            ->withToken($apiKey);

        if (!(bool) config('services.openai.verify_ssl', true)) {
            $requestClient = $requestClient->withoutVerifying();
        }

        if ($forceIpv4 && defined('CURLOPT_IPRESOLVE') && defined('CURL_IPRESOLVE_V4')) {
            $requestClient = $requestClient->withOptions([
                'curl' => [
                    CURLOPT_IPRESOLVE => CURL_IPRESOLVE_V4,
                ],
            ]);
        }

        try {
            $response = $requestClient->post("{$baseUrl}/chat/completions", [
                'model' => $model,
                'messages' => [
                    ['role' => 'system', 'content' => $systemPrompt],
                    ['role' => 'user', 'content' => $userPrompt],
                ],
                'temperature' => 0.3,
                'response_format' => [
                    'type' => 'json_schema',
                    'json_schema' => [
                        'name' => 'quiz_generation',
                        'strict' => true,
                        'schema' => $schema,
                    ],
                ],
            ]);
        } catch (ConnectionException $exception) {
            if ($allowLocalFallback) {
                Log::warning('OpenAI connection failed. Using local question generator fallback.', [
                    'message' => $exception->getMessage(),
                ]);

                return $this->generateQuestionsFromLocalRules($input, $coverageText, $selectedTypes, $generateExplanations, $fileContext);
            }

            throw new RuntimeException(
                'OpenAI network error: DNS/connection timeout. Check internet/DNS and try again.'
            );
        }

        if (!$response->successful()) {
            $message = data_get($response->json(), 'error.message') ?: 'OpenAI request failed.';
            if ($allowLocalFallback) {
                Log::warning('OpenAI request failed. Using local question generator fallback.', [
                    'message' => $message,
                ]);

                return $this->generateQuestionsFromLocalRules($input, $coverageText, $selectedTypes, $generateExplanations, $fileContext);
            }

            throw new RuntimeException("OpenAI error: {$message}");
        }

        $content = data_get($response->json(), 'choices.0.message.content');
        if (!is_string($content) || trim($content) === '') {
            if ($allowLocalFallback) {
                Log::warning('OpenAI returned empty response. Using local question generator fallback.');

                return $this->generateQuestionsFromLocalRules($input, $coverageText, $selectedTypes, $generateExplanations, $fileContext);
            }

            throw new RuntimeException('OpenAI returned an empty response.');
        }

        $decoded = json_decode($content, true);
        if (!is_array($decoded)) {
            if ($allowLocalFallback) {
                Log::warning('OpenAI JSON parse failed. Using local question generator fallback.');

                return $this->generateQuestionsFromLocalRules($input, $coverageText, $selectedTypes, $generateExplanations, $fileContext);
            }

            throw new RuntimeException('AI response JSON could not be parsed.');
        }

        $rawQuestions = data_get($decoded, 'questions', []);
        if (!is_array($rawQuestions)) {
            if ($allowLocalFallback) {
                Log::warning('OpenAI response missing questions array. Using local question generator fallback.');

                return $this->generateQuestionsFromLocalRules($input, $coverageText, $selectedTypes, $generateExplanations, $fileContext);
            }

            throw new RuntimeException('AI response does not include questions array.');
        }

        return $this->normalizeGeneratedQuestions($rawQuestions, $selectedTypes, $generateExplanations);
    }

    /**
     * Lightweight local generator used when OpenAI is unavailable.
     *
     * @param  array<string, mixed>  $input
     * @param  array<int, string>  $selectedTypes
     * @return array<int, array{question_type:string,prompt:string,points:float,explanation:?string,options:array<int, array{text:string,is_correct:bool}>}>
     */
    private function generateQuestionsFromLocalRules(
        array $input,
        string $coverageText,
        array $selectedTypes,
        bool $generateExplanations,
        string $fileContext
    ): array {
        $questionCount = (int) ($input['question_count'] ?? 10);
        if ($questionCount < 1) {
            $questionCount = 1;
        }
        if ($questionCount > 30) {
            $questionCount = 30;
        }

        $allowedTypes = collect($selectedTypes)
            ->map(static fn (string $type): string => strtolower(trim($type)))
            ->filter(static fn (string $type): bool => in_array($type, ['mcq_single', 'true_false', 'short_answer'], true))
            ->values()
            ->all();

        if (count($allowedTypes) === 0) {
            $allowedTypes = ['mcq_single', 'true_false', 'short_answer'];
        }

        $patternModelQuestions = $this->generateQuestionsFromPatternModel(
            $input,
            $coverageText,
            $allowedTypes,
            $generateExplanations,
            $fileContext
        );
        if (count($patternModelQuestions) > 0) {
            return $patternModelQuestions;
        }

        $topicPool = $this->extractTopicKeywords($coverageText . ' ' . $fileContext);
        if (count($topicPool) === 0) {
            $topicPool = ['core concept', 'key principle', 'practical application', 'real-world example'];
        }

        $rawQuestions = [];
        $topicCount = count($topicPool);
        $typeCount = count($allowedTypes);

        for ($i = 0; $i < $questionCount; $i++) {
            $type = $allowedTypes[$i % $typeCount];
            $topic = $topicPool[$i % $topicCount];
            $related = $topicPool[($i + 1) % $topicCount];
            $points = (float) (($i % 3) + 1);

            if ($type === 'mcq_single') {
                $correct = "It focuses on {$topic}.";
                $rawQuestions[] = [
                    'question_type' => 'mcq_single',
                    'prompt' => "Which statement best describes {$topic}?",
                    'options' => [
                        $correct,
                        "It is unrelated to {$topic}.",
                        "It replaces {$related} completely.",
                        "It only applies when {$related} is absent.",
                    ],
                    'correct_answer' => $correct,
                    'explanation' => $generateExplanations
                        ? "{$topic} is the main concept being tested in this item."
                        : '',
                    'points' => $points,
                ];
                continue;
            }

            if ($type === 'true_false') {
                $isTrue = $i % 2 === 0;
                $statement = $isTrue
                    ? "{$topic} can be connected to {$related} in practical scenarios."
                    : "{$topic} can never be used with {$related} under any condition.";
                $rawQuestions[] = [
                    'question_type' => 'true_false',
                    'prompt' => "True or False: {$statement}",
                    'options' => ['True', 'False'],
                    'correct_answer' => $isTrue ? 'True' : 'False',
                    'explanation' => $generateExplanations
                        ? ($isTrue
                            ? "The statement is generally valid for common learning contexts."
                            : "The word 'never' makes the statement too absolute, so it is false.")
                        : '',
                    'points' => $points,
                ];
                continue;
            }

            $rawQuestions[] = [
                'question_type' => 'short_answer',
                'prompt' => "In 1-2 sentences, explain {$topic} and mention one example.",
                'options' => [],
                'correct_answer' => "{$topic} explained with one valid example.",
                'explanation' => $generateExplanations
                    ? "This checks conceptual understanding and application."
                    : '',
                'points' => $points,
            ];
        }

        return $this->normalizeGeneratedQuestions($rawQuestions, $allowedTypes, $generateExplanations);
    }

    /**
     * Local "trained" pattern model generation.
     *
     * @param  array<string, mixed>  $input
     * @param  array<int, string>  $allowedTypes
     * @return array<int, array{question_type:string,prompt:string,points:float,explanation:?string,options:array<int, array{text:string,is_correct:bool}>}>
     */
    private function generateQuestionsFromPatternModel(
        array $input,
        string $coverageText,
        array $allowedTypes,
        bool $generateExplanations,
        string $fileContext
    ): array {
        $projectRoot = dirname(base_path());
        $defaultPath = $projectRoot . DIRECTORY_SEPARATOR . 'ai' . DIRECTORY_SEPARATOR . 'models' . DIRECTORY_SEPARATOR . 'quiz_generator_patterns.json';
        $configuredPath = (string) env('AI_PATTERN_MODEL_PATH', $defaultPath);
        $modelPath = $configuredPath !== '' ? $configuredPath : $defaultPath;

        if (!is_file($modelPath)) {
            return [];
        }

        $raw = @file_get_contents($modelPath);
        if (!is_string($raw) || trim($raw) === '') {
            return [];
        }

        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            return [];
        }

        $patterns = data_get($decoded, 'patterns', []);
        if (!is_array($patterns) || count($patterns) === 0) {
            return [];
        }

        $questionCount = (int) ($input['question_count'] ?? 10);
        if ($questionCount < 1) {
            $questionCount = 1;
        }
        if ($questionCount > 30) {
            $questionCount = 30;
        }

        $topicPool = $this->extractTopicKeywords($coverageText . ' ' . $fileContext);
        if (count($topicPool) === 0) {
            $topicPool = ['concept', 'principle', 'application', 'example'];
        }

        $rawQuestions = [];
        $typeCount = count($allowedTypes);
        $topicCount = count($topicPool);

        for ($i = 0; $i < $questionCount; $i++) {
            $targetType = $allowedTypes[$i % $typeCount];
            $topic = $topicPool[$i % $topicCount];
            $related = $topicPool[($i + 1) % $topicCount];

            $candidates = array_values(array_filter($patterns, static function ($pattern) use ($targetType): bool {
                return is_array($pattern) && strtolower((string) ($pattern['question_type'] ?? '')) === $targetType;
            }));

            if (count($candidates) === 0) {
                continue;
            }

            usort($candidates, function ($a, $b) use ($topicPool): int {
                $scoreA = $this->patternScore($a, $topicPool);
                $scoreB = $this->patternScore($b, $topicPool);
                return $scoreB <=> $scoreA;
            });

            $selected = $candidates[$i % count($candidates)];
            $rawQuestions[] = [
                'question_type' => $targetType,
                'prompt' => $this->renderPatternString((string) ($selected['prompt_template'] ?? ''), $topic, $related, $i + 1),
                'options' => $this->renderPatternArray($selected['options'] ?? [], $topic, $related, $i + 1),
                'correct_answer' => $this->renderPatternString((string) ($selected['correct_answer'] ?? ''), $topic, $related, $i + 1),
                'explanation' => $generateExplanations
                    ? $this->renderPatternString((string) ($selected['explanation'] ?? ''), $topic, $related, $i + 1)
                    : '',
                'points' => (float) ($selected['points'] ?? (($i % 3) + 1)),
            ];
        }

        return $this->normalizeGeneratedQuestions($rawQuestions, $allowedTypes, $generateExplanations);
    }

    private function patternScore(array $pattern, array $topicPool): int
    {
        $keywords = $pattern['keywords'] ?? [];
        if (!is_array($keywords) || count($keywords) === 0) {
            return 0;
        }

        $topicMap = [];
        foreach ($topicPool as $topic) {
            $topicMap[strtolower((string) $topic)] = true;
        }

        $score = 0;
        foreach ($keywords as $keyword) {
            $key = strtolower(trim((string) $keyword));
            if ($key !== '' && isset($topicMap[$key])) {
                $score++;
            }
        }

        return $score;
    }

    private function renderPatternString(string $template, string $topic, string $related, int $index): string
    {
        $value = trim($template);
        if ($value === '') {
            return '';
        }

        return str_replace(
            ['{topic}', '{related}', '{n}'],
            [$topic, $related, (string) $index],
            $value
        );
    }

    /**
     * @param  mixed  $rawOptions
     * @return array<int, string>
     */
    private function renderPatternArray(mixed $rawOptions, string $topic, string $related, int $index): array
    {
        if (!is_array($rawOptions)) {
            return [];
        }

        $result = [];
        foreach ($rawOptions as $option) {
            $text = $this->renderPatternString((string) $option, $topic, $related, $index);
            if ($text !== '') {
                $result[] = $text;
            }
        }

        return $result;
    }

    /**
     * @return array<int, string>
     */
    private function extractTopicKeywords(string $text): array
    {
        $normalized = strtolower($text);
        $normalized = preg_replace('/[^a-z0-9\s]/', ' ', $normalized) ?: $normalized;
        $parts = preg_split('/\s+/', trim($normalized)) ?: [];
        $stopWords = [
            'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'your', 'have', 'has',
            'are', 'was', 'were', 'will', 'can', 'about', 'what', 'when', 'where', 'which',
            'quiz', 'question', 'questions', 'using', 'file', 'upload', 'prompt', 'please',
        ];
        $stopMap = array_flip($stopWords);

        $keywords = [];
        foreach ($parts as $word) {
            if (!is_string($word)) {
                continue;
            }

            $word = trim($word);
            if ($word === '' || strlen($word) < 4) {
                continue;
            }

            if (isset($stopMap[$word])) {
                continue;
            }

            $keywords[$word] = true;
            if (count($keywords) >= 10) {
                break;
            }
        }

        return array_keys($keywords);
    }

    /**
     * @param  array<int, mixed>  $rawQuestions
     * @param  array<int, string>  $selectedTypes
     * @return array<int, array{question_type:string,prompt:string,points:float,explanation:?string,options:array<int, array{text:string,is_correct:bool}>}>
     */
    private function normalizeGeneratedQuestions(array $rawQuestions, array $selectedTypes, bool $generateExplanations): array
    {
        $normalized = [];
        $allowedTypes = collect($selectedTypes)
            ->map(static fn (string $type): string => strtolower(trim($type)))
            ->filter(static fn (string $type): bool => in_array($type, ['mcq_single', 'true_false', 'short_answer'], true))
            ->values()
            ->all();

        if (count($allowedTypes) === 0) {
            $allowedTypes = ['mcq_single', 'true_false', 'short_answer'];
        }

        $defaultType = $allowedTypes[0];

        foreach ($rawQuestions as $item) {
            if (!is_array($item)) {
                continue;
            }

            $prompt = trim((string) ($item['prompt'] ?? ''));
            if ($prompt === '') {
                continue;
            }

            $rawType = strtolower((string) ($item['question_type'] ?? ''));
            $type = in_array($rawType, ['mcq_single', 'true_false', 'short_answer'], true)
                ? $rawType
                : $defaultType;

            if (!in_array($type, $allowedTypes, true)) {
                $type = $defaultType;
            }

            $points = (float) ($item['points'] ?? 1);
            if ($points <= 0) {
                $points = 1;
            }
            if ($points > 10) {
                $points = 10;
            }

            $optionsList = [];
            $rawOptions = $item['options'] ?? [];
            if ($type === 'true_false') {
                $optionsList = ['True', 'False'];
            } elseif ($type === 'short_answer') {
                $optionsList = [];
            } elseif (is_array($rawOptions)) {
                foreach ($rawOptions as $rawOption) {
                    $text = trim((string) $rawOption);
                    if ($text !== '') {
                        $optionsList[] = $text;
                    }
                }
            }

            if ($type === 'mcq_single' && count($optionsList) < 2) {
                $optionsList = ['Option A', 'Option B'];
            }

            $correctAnswer = trim((string) ($item['correct_answer'] ?? ''));
            if ($correctAnswer === '' && count($optionsList) > 0) {
                $correctAnswer = $optionsList[0];
            }

            $normalizedOptions = [];
            foreach ($optionsList as $optionText) {
                $normalizedOptions[] = [
                    'text' => $optionText,
                    'is_correct' => strcasecmp($optionText, $correctAnswer) === 0,
                ];
            }

            if (count($normalizedOptions) > 0 && !collect($normalizedOptions)->contains('is_correct', true)) {
                $normalizedOptions[0]['is_correct'] = true;
            }

            if ($type === 'short_answer') {
                $normalizedOptions = [];
            }

            $normalized[] = [
                'question_type' => $type,
                'prompt' => $prompt,
                'points' => $points,
                'explanation' => $generateExplanations ? (trim((string) ($item['explanation'] ?? '')) ?: null) : null,
                'options' => $normalizedOptions,
            ];
        }

        return $normalized;
    }

    private function extractFileContext(?UploadedFile $file): string
    {
        if (!$file) {
            return '';
        }

        $originalName = (string) $file->getClientOriginalName();
        $extension = strtolower((string) $file->getClientOriginalExtension());
        $path = $file->getRealPath();
        if (!$path || !is_file($path)) {
            return "Uploaded file {$originalName} could not be read.";
        }

        if (in_array($extension, ['txt', 'md', 'csv', 'json'], true)) {
            $raw = @file_get_contents($path);
            if (!is_string($raw) || trim($raw) === '') {
                return "Uploaded file {$originalName} is empty.";
            }

            $normalized = preg_replace('/\s+/', ' ', $raw) ?: $raw;
            return substr($normalized, 0, 6000);
        }

        if (in_array($extension, ['jpg', 'jpeg', 'png'], true)) {
            return "Image file uploaded: {$originalName}. Focus on prompt text and infer likely context from image material.";
        }

        if ($extension === 'pdf') {
            return "PDF file uploaded: {$originalName}. Use prompt details as primary context.";
        }

        return "File uploaded: {$originalName}.";
    }

    private function storePublicImage(?UploadedFile $file, string $directory): ?string
    {
        if (!$file) {
            return null;
        }

        Validator::make(
            ['file' => $file],
            ['file' => ['required', 'file', 'image', 'max:10240']]
        )->validate();

        return $file->store($directory, 'public');
    }

    private function storePublicVideo(?UploadedFile $file, string $directory): ?array
    {
        if (!$file) {
            return null;
        }

        Validator::make(
            ['file' => $file],
            ['file' => ['required', 'file', 'mimetypes:video/mp4,video/webm,video/quicktime,video/x-matroska', 'max:51200']]
        )->validate();

        $storedPath = $file->store($directory, 'public');

        return [
            'path' => $storedPath,
            'url' => Storage::disk('public')->url($storedPath),
        ];
    }

    private function buildStoredFileMeta(?UploadedFile $file, ?string $storagePath, ?string $publicUrl = null): ?array
    {
        if (!$file || !is_string($storagePath) || trim($storagePath) === '') {
            return null;
        }

        $size = $file->getSize();

        return [
            'source' => 'upload',
            'original_name' => $file->getClientOriginalName(),
            'stored_name' => basename($storagePath),
            'storage_path' => $storagePath,
            'public_url' => $publicUrl ?: $this->toPublicFileUrl($storagePath),
            'mime_type' => $file->getClientMimeType() ?: $file->getMimeType(),
            'extension' => strtolower((string) $file->getClientOriginalExtension()),
            'size_bytes' => is_numeric($size) ? (int) $size : null,
            'captured_at' => now()->toDateTimeString(),
        ];
    }

    private function buildExternalVideoMeta(?string $url): ?array
    {
        $value = trim((string) $url);
        if ($value === '') {
            return null;
        }

        return [
            'source' => 'url',
            'url' => $value,
            'captured_at' => now()->toDateTimeString(),
        ];
    }

    private function toPublicFileUrl(?string $path): ?string
    {
        $value = trim((string) $path);
        if ($value === '') {
            return null;
        }

        if (str_starts_with($value, 'http://') || str_starts_with($value, 'https://') || str_starts_with($value, '/')) {
            return $value;
        }

        return Storage::disk('public')->url($value);
    }

    private function resolveSystemPrompt(): string
    {
        $projectRoot = dirname(base_path());
        $promptPath = $projectRoot . DIRECTORY_SEPARATOR . 'ai' . DIRECTORY_SEPARATOR . 'prompts' . DIRECTORY_SEPARATOR . 'quiz-generation.md';

        if (is_file($promptPath)) {
            $content = @file_get_contents($promptPath);
            if (is_string($content) && trim($content) !== '') {
                return $content;
            }
        }

        return 'You are an assessment generator. Return only valid JSON.';
    }

    private function resolveQuizForUser(Request $request, int $quizId): ?Quiz
    {
        $roleName = strtolower((string) ($request->user()?->role?->name ?? ''));
        $isAdmin = $roleName === 'admin';

        $query = Quiz::query();
        if (!$isAdmin) {
            $query->where('instructor_id', (int) $request->user()->id);
        }

        return $query->whereKey($quizId)->first();
    }

    /**
     * @return array<string, mixed>
     */
    private function quizSettingValidationRules(): array
    {
        return [
            'settings' => ['nullable', 'array'],
            'settings.delivery_method' => ['nullable', 'string', Rule::in(['instant_feedback', 'open_navigation', 'teacher_paced'])],
            'settings.require_names' => ['nullable', 'boolean'],
            'settings.show_question_feedback' => ['nullable', 'boolean'],
            'settings.show_final_score' => ['nullable', 'boolean'],
            'settings.fullscreen_required' => ['nullable', 'boolean'],
            'settings.allow_copy' => ['nullable', 'boolean'],
            'settings.allow_tab_switch' => ['nullable', 'boolean'],
        ];
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    private function buildQuizSettingsPayload(array $validated, ?QuizSetting $existingSettings = null, ?bool $allowBackNavigation = null): array
    {
        $resolvedAllowBackNavigation = $allowBackNavigation
            ?? (array_key_exists('allow_back_navigation', $validated)
                ? (bool) $validated['allow_back_navigation']
                : true);

        $deliveryMethod = (string) data_get(
            $validated,
            'settings.delivery_method',
            $existingSettings?->delivery_method ?? ($resolvedAllowBackNavigation ? 'open_navigation' : 'instant_feedback')
        );

        return [
            'delivery_method' => $deliveryMethod,
            'require_names' => (bool) data_get($validated, 'settings.require_names', $existingSettings?->require_names ?? true),
            'show_question_feedback' => (bool) data_get(
                $validated,
                'settings.show_question_feedback',
                $existingSettings?->show_question_feedback ?? ($deliveryMethod === 'instant_feedback')
            ),
            'show_final_score' => (bool) data_get($validated, 'settings.show_final_score', $existingSettings?->show_final_score ?? false),
            'fullscreen_required' => (bool) data_get($validated, 'settings.fullscreen_required', $existingSettings?->fullscreen_required ?? true),
            'allow_copy' => (bool) data_get($validated, 'settings.allow_copy', $existingSettings?->allow_copy ?? false),
            'allow_tab_switch' => (bool) data_get($validated, 'settings.allow_tab_switch', $existingSettings?->allow_tab_switch ?? false),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function mapQuizSettings(Quiz $quiz): array
    {
        $deliveryMethod = (string) ($quiz->settings?->delivery_method ?: ($quiz->allow_back_navigation ? 'open_navigation' : 'instant_feedback'));

        return [
            'delivery_method' => $deliveryMethod,
            'require_names' => (bool) ($quiz->settings?->require_names ?? true),
            'show_question_feedback' => (bool) ($quiz->settings?->show_question_feedback ?? ($deliveryMethod === 'instant_feedback')),
            'show_final_score' => (bool) ($quiz->settings?->show_final_score ?? false),
            'fullscreen_required' => (bool) ($quiz->settings?->fullscreen_required ?? true),
            'allow_copy' => (bool) ($quiz->settings?->allow_copy ?? false),
            'allow_tab_switch' => (bool) ($quiz->settings?->allow_tab_switch ?? false),
        ];
    }

    private function mapQuiz(Quiz $quiz, bool $includeQuestions = false): array
    {
        $quiz->loadMissing('settings');

        $base = [
            'id' => (int) $quiz->id,
            'title' => (string) $quiz->title,
            'description' => (string) ($quiz->description ?? ''),
            'cover_image_path' => $quiz->cover_image_path,
            'cover_image_url' => $this->toPublicFileUrl($quiz->cover_image_path),
            'cover_image_meta' => $quiz->cover_image_meta,
            'cover_video_url' => $quiz->cover_video_url,
            'cover_video_meta' => $quiz->cover_video_meta,
            'room_id' => $quiz->room_id ? (int) $quiz->room_id : null,
            'status' => (string) $quiz->status,
            'time_limit_seconds' => $quiz->time_limit_seconds,
            'max_attempts' => (int) ($quiz->max_attempts ?? 1),
            'shuffle_questions' => (bool) $quiz->shuffle_questions,
            'shuffle_options' => (bool) $quiz->shuffle_options,
            'allow_back_navigation' => (bool) $quiz->allow_back_navigation,
            'settings' => $this->mapQuizSettings($quiz),
            'instructor' => [
                'id' => (int) ($quiz->instructor?->id ?? 0),
                'full_name' => (string) ($quiz->instructor?->full_name ?: $quiz->instructor?->name ?: ''),
                'email' => (string) ($quiz->instructor?->email ?? ''),
            ],
            'created_at' => optional($quiz->created_at)?->toDateTimeString(),
            'updated_at' => optional($quiz->updated_at)?->toDateTimeString(),
        ];

        if (!$includeQuestions) {
            return $base;
        }

        $questions = $quiz->relationLoaded('questions')
            ? $quiz->questions->sortBy([
                ['order_no', 'asc'],
                ['id', 'asc'],
            ])->values()
            : collect();

        $questionRows = $questions
            ->map(function (Question $question): array {
                $options = $question->relationLoaded('options')
                    ? $question->options
                        ->sortBy([
                            ['order_no', 'asc'],
                            ['id', 'asc'],
                        ])
                        ->values()
                    : collect();

                return [
                    'id' => (int) $question->id,
                    'question_type' => (string) $question->question_type,
                    'prompt' => (string) $question->prompt,
                    'points' => (float) $question->points,
                    'order_no' => (int) $question->order_no,
                    'explanation' => $question->explanation,
                    'image_path' => $question->image_path,
                    'image_url' => $this->toPublicFileUrl($question->image_path),
                    'image_meta' => $question->image_meta,
                    'video_url' => $question->video_url,
                    'video_meta' => $question->video_meta,
                    'options_count' => (int) $options->count(),
                    'options' => $options
                        ->map(function (QuestionOption $option): array {
                            return [
                                'id' => (int) $option->id,
                                'text' => (string) $option->option_text,
                                'is_correct' => (bool) $option->is_correct,
                                'order_no' => (int) $option->order_no,
                                'image_path' => $option->image_path,
                                'image_url' => $this->toPublicFileUrl($option->image_path),
                                'image_meta' => $option->image_meta,
                            ];
                        })
                        ->values(),
                ];
            })
            ->values();

        $base['question_count'] = (int) $questionRows->count();
        $base['questions'] = $questionRows;
        $base['questions_preview'] = $questionRows->take(10)->values();

        return $base;
    }
}
