<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class UserManagementController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['nullable', 'string', 'in:all,active,blocked'],
            'role' => ['nullable', 'string', 'in:admin,teacher,instructor,student'],
            'search' => ['nullable', 'string', 'max:150'],
        ]);

        $query = User::query()->with('role');

        $status = strtolower((string) ($validated['status'] ?? 'all'));
        if ($status === 'active') {
            $query->where('is_active', 1);
        } elseif ($status === 'blocked') {
            $query->where('is_active', 0);
        }

        if (!empty($validated['role'])) {
            $roleName = strtolower((string) $validated['role']);
            $query->whereHas('role', static function ($builder) use ($roleName): void {
                $builder->whereRaw('LOWER(name) = ?', [$roleName]);
            });
        }

        if (!empty($validated['search'])) {
            $search = trim((string) $validated['search']);
            $query->where(function ($builder) use ($search): void {
                if ($this->hasUsersColumn('full_name')) {
                    $builder->orWhere('full_name', 'like', "%{$search}%");
                }
                if ($this->hasUsersColumn('name')) {
                    $builder->orWhere('name', 'like', "%{$search}%");
                }
            });
        }

        $users = $query
            ->orderByDesc('id')
            ->get()
            ->map(function (User $user): array {
                return [
                    'id' => (int) $user->id,
                    'full_name' => (string) ($user->full_name ?: $user->name ?: ''),
                    'is_active' => (bool) $user->is_active,
                    'status' => $user->is_active ? 'active' : 'blocked',
                    'role' => [
                        'id' => (int) ($user->role?->id ?? 0),
                        'name' => (string) ($user->role?->name ?? ''),
                    ],
                    'last_login_at' => optional($user->last_login_at)?->toDateTimeString(),
                    'created_at' => optional($user->created_at)?->toDateTimeString(),
                ];
            })
            ->values();

        return response()->json([
            'users' => $users,
            'summary' => [
                'total' => (int) User::query()->count(),
                'active' => (int) User::query()->where('is_active', 1)->count(),
                'blocked' => (int) User::query()->where('is_active', 0)->count(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'full_name' => ['required', 'string', 'max:150'],
            'role' => ['required', 'string', 'in:admin,teacher,instructor,student'],
            'password' => ['required', 'string', 'min:4', 'confirmed'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $role = Role::query()->firstOrCreate(['name' => strtolower((string) $validated['role'])]);
        $payloadInput = [
            'role_id' => (int) $role->id,
            ...$validated,
        ];

        if ($this->hasUsersColumn('email')) {
            $payloadInput['email'] = $this->generateInternalEmail((string) $validated['full_name']);
        }

        $payload = $this->buildUserPayload($payloadInput);

        $user = User::query()->create($payload);
        $user->load('role');

        return response()->json([
            'message' => 'User created successfully.',
            'user' => [
                'id' => (int) $user->id,
                'full_name' => (string) ($user->full_name ?: $user->name ?: ''),
                'is_active' => (bool) $user->is_active,
                'status' => $user->is_active ? 'active' : 'blocked',
                'role' => [
                    'id' => (int) ($user->role?->id ?? 0),
                    'name' => (string) ($user->role?->name ?? ''),
                ],
                'created_at' => optional($user->created_at)?->toDateTimeString(),
            ],
        ], 201);
    }

    public function update(Request $request, int $userId): JsonResponse
    {
        $user = User::query()->with('role')->findOrFail($userId);

        $validated = $request->validate([
            'full_name' => ['sometimes', 'required', 'string', 'max:150'],
            'role' => ['sometimes', 'required', 'string', 'in:admin,teacher,instructor,student'],
            'password' => ['sometimes', 'nullable', 'string', 'min:4', 'confirmed'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        if (array_key_exists('role', $validated)) {
            $role = Role::query()->firstOrCreate(['name' => strtolower((string) $validated['role'])]);
            $validated['role_id'] = (int) $role->id;
        }

        $payload = $this->buildUserPayload($validated);
        if (empty($payload)) {
            return response()->json([
                'message' => 'No changes submitted.',
            ], 422);
        }

        $user->fill($payload);
        $user->save();
        $user->load('role');

        return response()->json([
            'message' => 'User updated successfully.',
            'user' => [
                'id' => (int) $user->id,
                'full_name' => (string) ($user->full_name ?: $user->name ?: ''),
                'is_active' => (bool) $user->is_active,
                'status' => $user->is_active ? 'active' : 'blocked',
                'role' => [
                    'id' => (int) ($user->role?->id ?? 0),
                    'name' => (string) ($user->role?->name ?? ''),
                ],
                'last_login_at' => optional($user->last_login_at)?->toDateTimeString(),
                'created_at' => optional($user->created_at)?->toDateTimeString(),
            ],
        ]);
    }

    public function updateStatus(Request $request, int $userId): JsonResponse
    {
        $validated = $request->validate([
            'is_active' => ['required', 'boolean'],
        ]);

        $user = User::query()->with('role')->findOrFail($userId);
        $user->is_active = (bool) $validated['is_active'];
        $user->save();

        return response()->json([
            'message' => 'User status updated successfully.',
            'user' => [
                'id' => (int) $user->id,
                'full_name' => (string) ($user->full_name ?: $user->name ?: ''),
                'is_active' => (bool) $user->is_active,
                'status' => $user->is_active ? 'active' : 'blocked',
                'role' => [
                    'id' => (int) ($user->role?->id ?? 0),
                    'name' => (string) ($user->role?->name ?? ''),
                ],
                'created_at' => optional($user->created_at)?->toDateTimeString(),
            ],
        ]);
    }

    public function destroy(Request $request, int $userId): JsonResponse
    {
        $user = User::query()->findOrFail($userId);
        $user->is_active = false;
        $user->save();

        return response()->json([
            'message' => 'User deletion is disabled. User has been blocked instead.',
        ]);
    }

    public function rolesSummary(): JsonResponse
    {
        $rows = Role::query()
            ->withCount('users')
            ->orderBy('name')
            ->get()
            ->map(static fn (Role $role): array => [
                'id' => (int) $role->id,
                'name' => (string) $role->name,
                'users_count' => (int) $role->users_count,
            ])
            ->values();

        return response()->json([
            'roles' => $rows,
        ]);
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    private function buildUserPayload(array $input): array
    {
        $payload = [];

        if (array_key_exists('role_id', $input)) {
            $payload['role_id'] = (int) $input['role_id'];
        }

        if (array_key_exists('full_name', $input)) {
            $payload['full_name'] = (string) $input['full_name'];

            if ($this->hasUsersColumn('name')) {
                $payload['name'] = (string) $input['full_name'];
            }
        }

        if (array_key_exists('email', $input)) {
            $payload['email'] = (string) $input['email'];
        }

        if (array_key_exists('is_active', $input)) {
            $payload['is_active'] = (bool) $input['is_active'];
        }

        if (!empty($input['password'])) {
            $hash = Hash::make((string) $input['password']);

            if ($this->hasUsersColumn('password_hash')) {
                $payload['password_hash'] = $hash;
            }

            if ($this->hasUsersColumn('password')) {
                $payload['password'] = $hash;
            }
        }

        return $payload;
    }

    private function hasUsersColumn(string $column): bool
    {
        return Schema::hasColumn('users', $column);
    }

    private function generateInternalEmail(string $fullName): string
    {
        $base = Str::of($fullName)
            ->lower()
            ->ascii()
            ->replaceMatches('/[^a-z0-9]+/', '.')
            ->trim('.')
            ->value();

        if ($base === '') {
            $base = 'user';
        }

        $suffix = 1;
        $candidate = "{$base}@internal.justquiz.local";

        while (User::query()->where('email', $candidate)->exists()) {
            $suffix += 1;
            $candidate = "{$base}.{$suffix}@internal.justquiz.local";
        }

        return $candidate;
    }
}
