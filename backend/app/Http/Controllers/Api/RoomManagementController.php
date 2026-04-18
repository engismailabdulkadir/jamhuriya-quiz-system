<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Room;
use App\Models\RoomMember;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;

class RoomManagementController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $hasRoomCodeColumn = Schema::hasColumn('rooms', 'room_code');
        $hasTitleColumn = Schema::hasColumn('rooms', 'title');

        $validated = $request->validate([
            'status' => ['nullable', Rule::in(['all', 'active', 'inactive'])],
            'search' => ['nullable', 'string', 'max:200'],
        ]);

        $query = Room::query()->with('instructor')->withCount('members');
        $isAdmin = $this->isAdmin($request);

        if (!$isAdmin) {
            $query->where('instructor_id', (int) $request->user()->id);
        }

        $status = strtolower((string) ($validated['status'] ?? 'all'));
        if ($status !== 'all') {
            $query->where('status', $status);
        }

        $search = trim((string) ($validated['search'] ?? ''));
        if ($search !== '') {
            $query->where(function ($builder) use ($search, $hasRoomCodeColumn, $hasTitleColumn): void {
                $builder->where('name', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%");

                if ($hasRoomCodeColumn) {
                    $builder->orWhere('room_code', 'like', "%{$search}%");
                }

                if ($hasTitleColumn) {
                    $builder->orWhere('title', 'like', "%{$search}%");
                }
            });
        }

        $rooms = $query
            ->orderByDesc('id')
            ->get()
            ->map(fn (Room $room): array => $this->mapRoom($room))
            ->values();

        return response()->json([
            'rooms' => $rooms,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $hasRoomCodeColumn = Schema::hasColumn('rooms', 'room_code');
        $hasTitleColumn = Schema::hasColumn('rooms', 'title');
        $codeMaxLength = $hasRoomCodeColumn ? 20 : 100;

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:200'],
            'code' => ['nullable', 'string', "max:{$codeMaxLength}"],
            'capacity' => ['nullable', 'integer', 'min:0', 'max:100000'],
            'instructor_id' => ['nullable', 'integer'],
            'status' => ['nullable', Rule::in(['active', 'inactive'])],
        ]);

        $isAdmin = $this->isAdmin($request);
        $roomName = trim((string) $validated['name']);
        $instructorId = $isAdmin
            ? (isset($validated['instructor_id']) ? (int) $validated['instructor_id'] : (int) $request->user()->id)
            : (int) $request->user()->id;

        if ($this->roomNameExists($roomName, $hasTitleColumn)) {
            return response()->json([
                'message' => 'Room name-kan hore ayuu u jiray. (Room name already exists.)',
            ], 422);
        }

        $requestedCode = strtoupper(trim((string) ($validated['code'] ?? '')));
        $normalizedCode = $requestedCode !== ''
            ? $this->ensureUniqueRoomCode($requestedCode, $hasRoomCodeColumn)
            : $this->generateUniqueRoomCode($hasRoomCodeColumn, $codeMaxLength);

        $status = (string) ($validated['status'] ?? 'active');
        $createPayload = [
            'name' => $roomName,
            'code' => $normalizedCode,
            'capacity' => (int) ($validated['capacity'] ?? 30),
            'instructor_id' => $instructorId,
            'status' => $status,
            'is_active' => $status === 'active',
        ];

        if ($hasRoomCodeColumn) {
            $createPayload['room_code'] = $normalizedCode;
        }

        if ($hasTitleColumn) {
            $createPayload['title'] = $roomName;
        }

        $room = Room::query()->create($createPayload);

        $room->load('instructor');

        return response()->json([
            'message' => 'Room created successfully.',
            'room' => $this->mapRoom($room),
        ], 201);
    }

    public function update(Request $request, int $roomId): JsonResponse
    {
        $room = $this->resolveRoomForUser($request, $roomId);
        if (!$room) {
            return response()->json(['message' => 'Room not found.'], 404);
        }

        $hasRoomCodeColumn = Schema::hasColumn('rooms', 'room_code');
        $hasTitleColumn = Schema::hasColumn('rooms', 'title');
        $codeMaxLength = $hasRoomCodeColumn ? 20 : 100;

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:200'],
            'code' => ['nullable', 'string', "max:{$codeMaxLength}"],
            'capacity' => ['nullable', 'integer', 'min:0', 'max:100000'],
            'instructor_id' => ['nullable', 'integer'],
            'status' => ['nullable', Rule::in(['active', 'inactive'])],
        ]);

        $isAdmin = $this->isAdmin($request);
        $roomName = trim((string) $validated['name']);
        $instructorId = $isAdmin
            ? (isset($validated['instructor_id'])
                ? (int) $validated['instructor_id']
                : ($room->instructor_id !== null ? (int) $room->instructor_id : null))
            : (int) $request->user()->id;

        if ($this->roomNameExists($roomName, $hasTitleColumn, $room->id)) {
            return response()->json([
                'message' => 'Room name-kan hore ayuu u jiray. (Room name already exists.)',
            ], 422);
        }

        $requestedCode = strtoupper(trim((string) ($validated['code'] ?? '')));
        if ($requestedCode !== '') {
            $normalizedCode = $this->ensureUniqueRoomCode($requestedCode, $hasRoomCodeColumn, $room->id);
        } else {
            $existingCode = strtoupper(trim((string) ($room->code ?: ($room->getAttribute('room_code') ?? ''))));
            $normalizedCode = $existingCode !== ''
                ? $this->ensureUniqueRoomCode($existingCode, $hasRoomCodeColumn, $room->id)
                : $this->generateUniqueRoomCode($hasRoomCodeColumn, $codeMaxLength, $room->id);
        }

        $status = (string) ($validated['status'] ?? $room->status ?? 'active');
        $updatePayload = [
            'name' => $roomName,
            'code' => $normalizedCode,
            'capacity' => (int) ($validated['capacity'] ?? $room->capacity ?? 30),
            'instructor_id' => $instructorId,
            'status' => $status,
            'is_active' => $status === 'active',
        ];

        if ($hasRoomCodeColumn) {
            $updatePayload['room_code'] = $normalizedCode;
        }

        if ($hasTitleColumn) {
            $updatePayload['title'] = $roomName;
        }

        $room->update($updatePayload);

        $room->load('instructor');

        return response()->json([
            'message' => 'Room updated successfully.',
            'room' => $this->mapRoom($room),
        ]);
    }

    public function destroy(Request $request, int $roomId): JsonResponse
    {
        $room = $this->resolveRoomForUser($request, $roomId);
        if (!$room) {
            return response()->json(['message' => 'Room not found.'], 404);
        }

        $room->delete();

        return response()->json([
            'message' => 'Room deleted successfully.',
        ]);
    }

    public function setStatus(Request $request, int $roomId): JsonResponse
    {
        $room = $this->resolveRoomForUser($request, $roomId);
        if (!$room) {
            return response()->json(['message' => 'Room not found.'], 404);
        }

        $validated = $request->validate([
            'status' => ['required', Rule::in(['active', 'inactive'])],
        ]);

        $status = (string) $validated['status'];
        $room->update([
            'status' => $status,
            'is_active' => $status === 'active',
        ]);

        return response()->json([
            'message' => 'Room status updated successfully.',
            'room' => $this->mapRoom($room),
        ]);
    }

    public function assignments(Request $request): JsonResponse
    {
        $query = Room::query()->with(['members' => function ($builder): void {
            $builder->orderBy('student_name');
        }])->withCount('members');

        if (!$this->isAdmin($request)) {
            $query->where('instructor_id', (int) $request->user()->id);
        }

        $rooms = $query
            ->orderBy('name')
            ->get()
            ->map(function (Room $room): array {
                $resolvedRoomCode = (string) ($room->code ?: ($room->getAttribute('room_code') ?? ''));
                $resolvedRoomName = (string) ($room->name ?: ($room->getAttribute('title') ?? ''));

                return [
                    'room_id' => (int) $room->id,
                    'room_name' => $resolvedRoomName,
                    'room_code' => $resolvedRoomCode,
                    'students_count' => (int) ($room->members_count ?? 0),
                    'students' => $room->members
                        ->map(static fn (RoomMember $member): array => [
                            'student_id' => (string) $member->student_id,
                            'student_name' => (string) $member->student_name,
                        ])
                        ->values()
                        ->all(),
                ];
            })
            ->values();

        return response()->json([
            'assignments' => $rooms,
        ]);
    }

    public function assignStudent(Request $request, int $roomId): JsonResponse
    {
        $room = $this->resolveRoomForUser($request, $roomId);
        if (!$room) {
            return response()->json(['message' => 'Room not found.'], 404);
        }

        $validated = $request->validate([
            'student_id' => ['required', 'string', 'max:50'],
            'student_name' => ['required', 'string', 'max:150'],
        ]);

        $member = RoomMember::query()->updateOrCreate(
            [
                'room_id' => $room->id,
                'student_id' => trim((string) $validated['student_id']),
            ],
            [
                'student_name' => trim((string) $validated['student_name']),
                'created_by_user_id' => (int) $request->user()->id,
            ]
        );
        $this->syncRoomCapacity($room);

        return response()->json([
            'message' => 'Student assigned successfully.',
            'student' => [
                'student_id' => (string) $member->student_id,
                'student_name' => (string) $member->student_name,
            ],
            'capacity' => (int) $room->capacity,
        ], 201);
    }

    public function bulkAssignStudents(Request $request, int $roomId): JsonResponse
    {
        $room = $this->resolveRoomForUser($request, $roomId);
        if (!$room) {
            return response()->json(['message' => 'Room not found.'], 404);
        }

        $validated = $request->validate([
            'students' => ['required', 'array', 'min:1'],
            'students.*.student_id' => ['required', 'string', 'max:50'],
            'students.*.student_name' => ['required', 'string', 'max:150'],
        ]);

        $added = 0;

        foreach ($validated['students'] as $student) {
            $studentId = trim((string) ($student['student_id'] ?? ''));
            $studentName = trim((string) ($student['student_name'] ?? ''));
            if ($studentId === '' || $studentName === '') {
                continue;
            }

            $record = RoomMember::query()->firstOrNew([
                'room_id' => $room->id,
                'student_id' => $studentId,
            ]);

            $isNew = !$record->exists;
            $record->student_name = $studentName;
            $record->created_by_user_id = (int) $request->user()->id;
            $record->save();

            if ($isNew) {
                $added++;
            }
        }
        $this->syncRoomCapacity($room);

        return response()->json([
            'message' => 'Students imported successfully.',
            'added_count' => $added,
            'capacity' => (int) $room->capacity,
        ]);
    }

    public function updateStudent(Request $request, int $roomId, string $studentId): JsonResponse
    {
        $room = $this->resolveRoomForUser($request, $roomId);
        if (!$room) {
            return response()->json(['message' => 'Room not found.'], 404);
        }

        $validated = $request->validate([
            'student_id' => ['required', 'string', 'max:50'],
            'student_name' => ['required', 'string', 'max:150'],
        ]);

        $decodedStudentId = trim(rawurldecode($studentId));
        $member = RoomMember::query()
            ->where('room_id', $room->id)
            ->where('student_id', $decodedStudentId)
            ->first();

        if (!$member) {
            return response()->json([
                'message' => 'Student not found in this room.',
            ], 404);
        }

        $nextStudentId = trim((string) $validated['student_id']);
        $nextStudentName = trim((string) $validated['student_name']);

        if ($nextStudentId === '' || $nextStudentName === '') {
            return response()->json([
                'message' => 'Student ID and Student Name are required.',
            ], 422);
        }

        if ($nextStudentId !== $decodedStudentId) {
            $exists = RoomMember::query()
                ->where('room_id', $room->id)
                ->where('student_id', $nextStudentId)
                ->exists();

            if ($exists) {
                return response()->json([
                    'message' => 'Student ID already exists in this room.',
                    'errors' => [
                        'student_id' => ['Student ID already exists in this room.'],
                    ],
                ], 422);
            }
        }

        $member->student_id = $nextStudentId;
        $member->student_name = $nextStudentName;
        $member->created_by_user_id = (int) $request->user()->id;
        $member->save();

        return response()->json([
            'message' => 'Student updated successfully.',
            'student' => [
                'student_id' => (string) $member->student_id,
                'student_name' => (string) $member->student_name,
            ],
        ]);
    }

    public function removeStudent(Request $request, int $roomId, string $studentId): JsonResponse
    {
        $room = $this->resolveRoomForUser($request, $roomId);
        if (!$room) {
            return response()->json(['message' => 'Room not found.'], 404);
        }

        $decodedStudentId = trim(rawurldecode($studentId));
        $member = RoomMember::query()
            ->where('room_id', $room->id)
            ->where('student_id', $decodedStudentId)
            ->first();

        if (!$member) {
            return response()->json([
                'message' => 'Student not found in this room.',
            ], 404);
        }

        $member->delete();
        $this->syncRoomCapacity($room);

        return response()->json([
            'message' => 'Student removed successfully.',
            'capacity' => (int) $room->capacity,
        ]);
    }

    public function verifyStudent(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'student_id' => ['required', 'string', 'max:50'],
            'student_name' => ['required', 'string', 'max:150'],
        ]);

        $studentId = strtolower(trim((string) $validated['student_id']));
        $studentName = strtolower(trim((string) $validated['student_name']));

        $exists = RoomMember::query()
            ->whereRaw('LOWER(TRIM(student_id)) = ?', [$studentId])
            ->whereRaw('LOWER(TRIM(student_name)) = ?', [$studentName])
            ->exists();

        return response()->json([
            'exists' => $exists,
        ]);
    }

    private function isAdmin(Request $request): bool
    {
        $roleName = strtolower((string) ($request->user()?->role?->name ?? ''));
        return $roleName === 'admin';
    }

    private function resolveRoomForUser(Request $request, int $roomId): ?Room
    {
        $query = Room::query()->whereKey($roomId);
        if (!$this->isAdmin($request)) {
            $query->where('instructor_id', (int) $request->user()->id);
        }

        return $query->first();
    }

    private function mapRoom(Room $room): array
    {
        $resolvedCode = (string) ($room->code ?: ($room->getAttribute('room_code') ?? ''));
        $resolvedName = (string) ($room->name ?: ($room->getAttribute('title') ?? ''));
        $shareUrl = rtrim(config('app.url', url('/')), '/') . '/student/access';
        $shareQrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=' . rawurlencode($shareUrl);

        return [
            'id' => (int) $room->id,
            'name' => $resolvedName,
            'code' => $resolvedCode,
            'capacity' => (int) ($room->capacity ?? 30),
            'instructor_id' => $room->instructor_id ? (int) $room->instructor_id : null,
            'instructor_name' => (string) ($room->instructor?->full_name ?: $room->instructor?->name ?: ''),
            'status' => (string) ($room->status ?: ($room->is_active ? 'active' : 'inactive')),
            'is_active' => (bool) $room->is_active,
            'students_count' => (int) ($room->members_count ?? 0),
            'share_url' => $shareUrl,
            'share_qr_url' => $shareQrUrl,
            'created_at' => optional($room->created_at)?->toDateTimeString(),
            'updated_at' => optional($room->updated_at)?->toDateTimeString(),
        ];
    }

    private function roomNameExists(string $roomName, bool $hasTitleColumn, ?int $ignoreRoomId = null): bool
    {
        $normalizedName = strtolower(trim($roomName));
        if ($normalizedName === '') {
            return false;
        }

        $query = Room::query()
            ->where(function ($builder) use ($normalizedName, $hasTitleColumn): void {
                $builder->whereRaw('LOWER(TRIM(name)) = ?', [$normalizedName]);

                if ($hasTitleColumn) {
                    $builder->orWhereRaw('LOWER(TRIM(title)) = ?', [$normalizedName]);
                }
            });

        if ($ignoreRoomId) {
            $query->where('id', '!=', $ignoreRoomId);
        }

        return $query->exists();
    }

    private function ensureUniqueRoomCode(string $code, bool $hasRoomCodeColumn, ?int $ignoreRoomId = null): string
    {
        $normalizedCode = strtoupper(trim($code));
        if ($normalizedCode === '') {
            return $this->generateUniqueRoomCode($hasRoomCodeColumn, 20, $ignoreRoomId);
        }

        $query = Room::query()
            ->where(function ($builder) use ($normalizedCode, $hasRoomCodeColumn): void {
                $builder->whereRaw('LOWER(code) = ?', [strtolower($normalizedCode)]);
                if ($hasRoomCodeColumn) {
                    $builder->orWhereRaw('LOWER(room_code) = ?', [strtolower($normalizedCode)]);
                }
            });

        if ($ignoreRoomId) {
            $query->where('id', '!=', $ignoreRoomId);
        }

        if ($query->exists()) {
            return $this->generateUniqueRoomCode($hasRoomCodeColumn, 20, $ignoreRoomId);
        }

        return $normalizedCode;
    }

    private function generateUniqueRoomCode(bool $hasRoomCodeColumn, int $maxLength = 20, ?int $ignoreRoomId = null): string
    {
        $maxLength = max(4, min(20, $maxLength));
        $nextSequence = $this->nextSequentialRoomCodeNumber($hasRoomCodeColumn, $ignoreRoomId);

        for ($candidateNumber = $nextSequence; $candidateNumber < 1000000000; $candidateNumber++) {
            $candidate = 'A'.$candidateNumber;
            if (strlen($candidate) > $maxLength) {
                break;
            }
            if (!$this->roomCodeExists($candidate, $hasRoomCodeColumn, $ignoreRoomId)) {
                return $candidate;
            }
        }

        for ($candidateNumber = 1; $candidateNumber < $nextSequence; $candidateNumber++) {
            $candidate = 'A'.$candidateNumber;
            if (strlen($candidate) > $maxLength) {
                break;
            }
            if (!$this->roomCodeExists($candidate, $hasRoomCodeColumn, $ignoreRoomId)) {
                return $candidate;
            }
        }

        for ($attempt = 0; $attempt < 100; $attempt++) {
            $candidate = 'A'.random_int(1, 999999999);
            if (strlen($candidate) > $maxLength) {
                continue;
            }
            if (!$this->roomCodeExists($candidate, $hasRoomCodeColumn, $ignoreRoomId)) {
                return $candidate;
            }
        }

        $timestampCandidate = 'A'.time();
        if (strlen($timestampCandidate) <= $maxLength
            && !$this->roomCodeExists($timestampCandidate, $hasRoomCodeColumn, $ignoreRoomId)
        ) {
            return $timestampCandidate;
        }

        throw new \RuntimeException('Unable to generate a unique room code.');
    }

    private function nextSequentialRoomCodeNumber(bool $hasRoomCodeColumn, ?int $ignoreRoomId = null): int
    {
        $query = Room::query()->select(['id', 'code']);

        if ($hasRoomCodeColumn) {
            $query->addSelect('room_code');
        }

        if ($ignoreRoomId) {
            $query->where('id', '!=', $ignoreRoomId);
        }

        $highest = 0;

        foreach ($query->get() as $room) {
            $codes = [(string) $room->code];
            if ($hasRoomCodeColumn) {
                $codes[] = (string) $room->getAttribute('room_code');
            }

            foreach ($codes as $rawCode) {
                $normalizedCode = strtoupper(trim($rawCode));
                if ($normalizedCode === '') {
                    continue;
                }

                if (preg_match('/^A(\d+)$/', $normalizedCode, $matches) === 1) {
                    $number = (int) $matches[1];
                    if ($number > $highest) {
                        $highest = $number;
                    }
                }
            }
        }

        return max(1, $highest + 1);
    }

    private function roomCodeExists(string $candidate, bool $hasRoomCodeColumn, ?int $ignoreRoomId = null): bool
    {
        $query = Room::query()
            ->where(function ($builder) use ($candidate, $hasRoomCodeColumn): void {
                $builder->whereRaw('LOWER(code) = ?', [strtolower($candidate)]);
                if ($hasRoomCodeColumn) {
                    $builder->orWhereRaw('LOWER(room_code) = ?', [strtolower($candidate)]);
                }
            });

        if ($ignoreRoomId) {
            $query->where('id', '!=', $ignoreRoomId);
        }

        return $query->exists();
    }

    private function syncRoomCapacity(Room $room): void
    {
        $memberCount = (int) RoomMember::query()
            ->where('room_id', $room->id)
            ->count();

        if ((int) $room->capacity === $memberCount) {
            return;
        }

        $room->capacity = $memberCount;
        $room->save();
        $room->refresh();
    }
}
