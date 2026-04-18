<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\LoginRequest;
use App\Http\Requests\RegisterRequest;
use App\Http\Requests\StudentAccessRequest;
use App\Models\AuthToken;
use App\Models\Role;
use App\Models\User;
use App\Support\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Throwable;
use Illuminate\Database\QueryException;

class AuthController extends Controller
{
    public function register(RegisterRequest $request): JsonResponse
    {
        try {
            $validated = $request->validated();
            $normalizedEmail = strtolower(trim((string) $validated['email']));
            $requestedRole = strtolower((string) ($validated['role'] ?? 'teacher'));

            if ($requestedRole !== 'teacher') {
                return response()->json([
                    'message' => 'Public registration allows teacher accounts only.',
                ], 403);
            }

            $roleId = Role::query()
                ->firstOrCreate(['name' => $requestedRole])
                ->id;

            if (!$roleId) {
                return response()->json([
                    'message' => 'Selected role not found.',
                ], 500);
            }

            $payload = [
                'role_id' => $roleId,
                'full_name' => $validated['full_name'],
                'email' => $normalizedEmail,
                'password_hash' => Hash::make($validated['password']),
                'is_active' => true,
            ];

            if (Schema::hasColumn('users', 'phone')) {
                $payload['phone'] = $validated['phone'] ?? null;
            }

            // Keep compatibility with both schema variants:
            // some databases have `name/password`, others use `full_name/password_hash`.
            if (Schema::hasColumn('users', 'name')) {
                $payload['name'] = $validated['full_name'];
            }

            if (Schema::hasColumn('users', 'password')) {
                $payload['password'] = Hash::make($validated['password']);
            }

            $user = User::query()->create($payload);

            $user->load('role');
            ActivityLogger::log((int) $user->id, 'auth.register', 'user', (int) $user->id);

            return response()->json([
                'message' => 'Registration successful.',
                'user' => $user,
            ], 201);
        } catch (Throwable $exception) {
            report($exception);

            if ($exception instanceof QueryException) {
                $message = strtolower($exception->getMessage());
                if (str_contains($message, 'could not find driver')) {
                    return response()->json([
                        'message' => 'Database driver missing. Enable the configured PDO extension in PHP.',
                    ], 500);
                }
                if (str_contains($message, '2002') || str_contains($message, 'while connecting') || str_contains($message, 'connection refused')) {
                    return response()->json([
                        'message' => 'Cannot connect to the database. Check database host, port, and credentials.',
                    ], 500);
                }
            }

            return response()->json([
                'message' => 'Registration failed due to server error.',
            ], 500);
        }
    }

    public function login(LoginRequest $request): JsonResponse
    {
        try {
            $validated = $request->validated();
            $identifier = trim((string) ($validated['username'] ?? $validated['email'] ?? ''));
            $password = (string) ($validated['password'] ?? '');

            $query = User::query()->with('role');

            if ($identifier !== '' && ctype_digit($identifier)) {
                $query->where('id', (int) $identifier);
            } elseif (str_contains($identifier, '@')) {
                $query->whereRaw('LOWER(email) = ?', [strtolower($identifier)]);
            } else {
                $query->where(function ($builder) use ($identifier): void {
                    $normalized = strtolower($identifier);

                    if (Schema::hasColumn('users', 'full_name')) {
                        $builder->orWhereRaw('LOWER(full_name) = ?', [$normalized]);
                    }

                    if (Schema::hasColumn('users', 'name')) {
                        $builder->orWhereRaw('LOWER(name) = ?', [$normalized]);
                    }

                    if (Schema::hasColumn('users', 'email')) {
                        $builder->orWhereRaw('LOWER(email) = ?', [$normalized]);
                    }
                });
            }

            $candidates = $query
                ->orderByDesc('id')
                ->limit(10)
                ->get();

            $user = null;
            foreach ($candidates as $candidate) {
                if ($this->isValidUserPassword($candidate, $password)) {
                    $user = $candidate;
                    break;
                }
            }

            if (!$user) {
                return response()->json([
                    'message' => 'Invalid credentials.',
                ], 422);
            }

            if ($user->role?->name === 'student') {
                return response()->json([
                    'message' => 'Student accounts must use the student access link flow.',
                ], 403);
            }

            if (!$user->is_active) {
                return response()->json([
                    'message' => 'Your account is inactive.',
                ], 403);
            }

            $now = now();
            $expiresAt = $now->copy()->addDays(7);
            $plainToken = Str::random(80);

            AuthToken::query()->create([
                'user_id' => $user->id,
                'token_hash' => hash('sha256', $plainToken),
                'issued_at' => $now,
                'expires_at' => $expiresAt,
                'user_agent' => Str::limit((string) $request->userAgent(), 255, ''),
                'ip_address' => (string) $request->ip(),
                'created_at' => $now,
            ]);

            $user->last_login_at = $now;
            $user->save();
            ActivityLogger::login((int) $user->id, (string) $request->ip());
            ActivityLogger::log((int) $user->id, 'auth.login', 'user', (int) $user->id);

            return response()->json([
                'message' => 'Login successful.',
                'token' => $plainToken,
                'token_type' => 'Bearer',
                'expires_at' => $expiresAt->toDateTimeString(),
                'user' => $user,
            ]);
        } catch (Throwable $exception) {
            report($exception);

            if ($exception instanceof QueryException) {
                $message = strtolower($exception->getMessage());
                if (str_contains($message, 'could not find driver')) {
                    return response()->json([
                        'message' => 'Database driver missing. Enable the configured PDO extension in PHP.',
                    ], 500);
                }
                if (str_contains($message, '2002') || str_contains($message, 'while connecting') || str_contains($message, 'connection refused')) {
                    return response()->json([
                        'message' => 'Cannot connect to the database. Check database host, port, and credentials.',
                    ], 500);
                }
            }

            return response()->json([
                'message' => 'Login failed due to server error.',
            ], 500);
        }
    }

    private function isValidUserPassword(User $user, string $plainPassword): bool
    {
        $storedHash = (string) ($user->password_hash ?: $user->password);

        if ($storedHash === '') {
            return false;
        }

        // Normal case: bcrypt/argon hash.
        if (Hash::check($plainPassword, $storedHash)) {
            return true;
        }

        // Legacy case: plain password saved directly; upgrade it on successful login.
        if (hash_equals($storedHash, $plainPassword)) {
            $newHash = Hash::make($plainPassword);
            $updates = [];

            if (Schema::hasColumn('users', 'password_hash')) {
                $updates['password_hash'] = $newHash;
            }

            if (Schema::hasColumn('users', 'password')) {
                $updates['password'] = $newHash;
            }

            if (!empty($updates)) {
                $user->forceFill($updates)->save();
            }

            return true;
        }

        return false;
    }

    public function studentAccess(StudentAccessRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $studentId = trim((string) ($validated['student_id'] ?? ''));
        $studentName = trim((string) ($validated['student_name'] ?? ''));

        if (Schema::hasTable('room_members')) {
            $hasAssignedStudents = DB::table('room_members')->count() > 0;

            if ($hasAssignedStudents) {
                $exists = DB::table('room_members')
                    ->whereRaw('LOWER(TRIM(student_id)) = ?', [strtolower($studentId)])
                    ->whereRaw('LOWER(TRIM(student_name)) = ?', [strtolower($studentName)])
                    ->exists();

                if (!$exists) {
                    ActivityLogger::log(null, 'student.access.denied');
                    return response()->json([
                        'message' => 'Student ID and Name are not in room assignment list.',
                    ], 403);
                }
            }
        }

        ActivityLogger::log(null, 'student.access.granted');

        return response()->json([
            'message' => 'Student access granted.',
            'student' => [
                'student_id' => $studentId,
                'student_name' => $studentName,
                'role' => 'student',
            ],
            'access_token' => Str::random(64),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        /** @var AuthToken|null $token */
        $token = $request->attributes->get('auth_token');

        if ($token && !$token->revoked_at) {
            $token->revoked_at = now();
            $token->save();
        }

        if ($request->user()?->id) {
            ActivityLogger::log((int) $request->user()->id, 'auth.logout', 'user', (int) $request->user()->id);
        }

        return response()->json([
            'message' => 'Logged out successfully.',
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user();

        if (!$user) {
            return response()->json([
                'message' => 'Unauthenticated.',
            ], 401);
        }

        $user->load('role');

        return response()->json([
            'user' => $user,
        ]);
    }
}
