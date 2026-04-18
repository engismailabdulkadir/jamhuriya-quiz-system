<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Permission;
use App\Models\Role;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class RolePermissionController extends Controller
{
    /**
     * @var string[]
     */
    private array $protectedRoles = ['admin', 'teacher', 'instructor', 'student'];

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'search' => ['nullable', 'string', 'max:120'],
        ]);

        $query = Role::query()
            ->withCount(['users', 'permissions'])
            ->with('permissions:id,name')
            ->orderBy('name');

        if (!empty($validated['search'])) {
            $search = trim((string) $validated['search']);
            $query->where('name', 'like', "%{$search}%");
        }

        $roles = $query
            ->get()
            ->map(function (Role $role): array {
                $roleName = strtolower((string) $role->name);

                return [
                    'id' => (int) $role->id,
                    'name' => (string) $role->name,
                    'users_count' => (int) $role->users_count,
                    'permissions_count' => (int) $role->permissions_count,
                    'permissions' => $role->permissions
                        ->sortBy('name')
                        ->map(static fn (Permission $permission): array => [
                            'id' => (int) $permission->id,
                            'name' => (string) $permission->name,
                        ])
                        ->values(),
                    'is_protected' => in_array($roleName, $this->protectedRoles, true),
                    'created_at' => optional($role->created_at)?->toDateTimeString(),
                    'updated_at' => optional($role->updated_at)?->toDateTimeString(),
                ];
            })
            ->values();

        return response()->json([
            'roles' => $roles,
            'summary' => [
                'total_roles' => (int) $roles->count(),
                'total_permissions' => (int) Permission::query()->count(),
            ],
        ]);
    }

    public function permissions(): JsonResponse
    {
        $permissions = Permission::query()
            ->orderBy('name')
            ->get()
            ->map(static function (Permission $permission): array {
                $name = (string) $permission->name;
                $segments = explode('.', $name, 2);
                $group = strtoupper((string) ($segments[0] ?? 'general'));
                $action = str_replace('_', ' ', (string) ($segments[1] ?? $name));

                return [
                    'id' => (int) $permission->id,
                    'name' => $name,
                    'description' => (string) ($permission->description ?? ''),
                    'group' => $group,
                    'label' => ucwords($action),
                ];
            })
            ->values();

        return response()->json([
            'permissions' => $permissions,
        ]);
    }

    public function storeRole(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:50', 'regex:/^[a-zA-Z0-9_\- ]+$/'],
        ]);

        $name = strtolower(trim((string) $validated['name']));
        $name = preg_replace('/\s+/', '_', $name) ?: $name;

        $exists = Role::query()->whereRaw('LOWER(name) = ?', [$name])->exists();
        if ($exists) {
            return response()->json([
                'message' => 'Role name already exists.',
            ], 422);
        }

        $role = Role::query()->create(['name' => $name]);
        $role->loadCount(['users', 'permissions']);

        return response()->json([
            'message' => 'Role created successfully.',
            'role' => [
                'id' => (int) $role->id,
                'name' => (string) $role->name,
                'users_count' => (int) $role->users_count,
                'permissions_count' => (int) $role->permissions_count,
                'is_protected' => in_array($name, $this->protectedRoles, true),
                'created_at' => optional($role->created_at)?->toDateTimeString(),
            ],
        ], 201);
    }

    public function updateRole(Request $request, int $roleId): JsonResponse
    {
        $role = Role::query()->findOrFail($roleId);
        $currentName = strtolower((string) $role->name);

        if (in_array($currentName, $this->protectedRoles, true)) {
            return response()->json([
                'message' => 'This role is protected and cannot be renamed.',
            ], 422);
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:50', 'regex:/^[a-zA-Z0-9_\- ]+$/'],
        ]);

        $name = strtolower(trim((string) $validated['name']));
        $name = preg_replace('/\s+/', '_', $name) ?: $name;

        $exists = Role::query()
            ->where('id', '!=', $role->id)
            ->whereRaw('LOWER(name) = ?', [$name])
            ->exists();

        if ($exists) {
            return response()->json([
                'message' => 'Role name already exists.',
            ], 422);
        }

        $role->name = $name;
        $role->save();
        $role->loadCount(['users', 'permissions']);

        return response()->json([
            'message' => 'Role updated successfully.',
            'role' => [
                'id' => (int) $role->id,
                'name' => (string) $role->name,
                'users_count' => (int) $role->users_count,
                'permissions_count' => (int) $role->permissions_count,
                'is_protected' => in_array($name, $this->protectedRoles, true),
                'updated_at' => optional($role->updated_at)?->toDateTimeString(),
            ],
        ]);
    }

    public function destroyRole(int $roleId): JsonResponse
    {
        $role = Role::query()->withCount('users')->findOrFail($roleId);
        $roleName = strtolower((string) $role->name);

        if (in_array($roleName, $this->protectedRoles, true)) {
            return response()->json([
                'message' => 'This role is protected and cannot be deleted.',
            ], 422);
        }

        if ($role->users_count > 0) {
            return response()->json([
                'message' => 'Cannot delete role that still has users.',
            ], 422);
        }

        $role->permissions()->detach();
        $role->delete();

        return response()->json([
            'message' => 'Role deleted successfully.',
        ]);
    }

    public function showRolePermissions(int $roleId): JsonResponse
    {
        $role = Role::query()
            ->with('permissions:id,name')
            ->withCount(['users', 'permissions'])
            ->findOrFail($roleId);

        return response()->json([
            'role' => [
                'id' => (int) $role->id,
                'name' => (string) $role->name,
                'users_count' => (int) $role->users_count,
                'permissions_count' => (int) $role->permissions_count,
            ],
            'permission_ids' => $role->permissions->pluck('id')->map(static fn ($id): int => (int) $id)->values(),
        ]);
    }

    public function assignPermissions(Request $request, int $roleId): JsonResponse
    {
        $role = Role::query()->findOrFail($roleId);

        $validated = $request->validate([
            'permission_ids' => ['required', 'array'],
            'permission_ids.*' => ['integer', Rule::exists('permissions', 'id')],
        ]);

        $permissionIds = collect($validated['permission_ids'])
            ->map(static fn ($id): int => (int) $id)
            ->unique()
            ->values()
            ->all();

        $role->permissions()->sync($permissionIds);
        $role->loadCount('permissions');

        return response()->json([
            'message' => 'Permissions assigned successfully.',
            'role' => [
                'id' => (int) $role->id,
                'name' => (string) $role->name,
                'permissions_count' => (int) $role->permissions_count,
            ],
            'permission_ids' => $permissionIds,
        ]);
    }
}
