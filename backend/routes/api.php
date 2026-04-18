<?php
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\AttemptManagementController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\QuizManagementController;
use App\Http\Controllers\Api\RoomManagementController;
use App\Http\Controllers\Api\RolePermissionController;
use App\Http\Controllers\Api\StudentAttemptController;
use App\Http\Controllers\Api\UserManagementController;
use Illuminate\Support\Facades\Route;

Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);
Route::post('/student/access', [AuthController::class, 'studentAccess']);
Route::post('/student/verify', [RoomManagementController::class, 'verifyStudent']);
Route::post('/student/quizzes', [StudentAttemptController::class, 'availableQuizzes']);
Route::post('/student/quizzes/{quizId}', [StudentAttemptController::class, 'showQuiz'])->whereNumber('quizId');
Route::post('/student/quizzes/{quizId}/attempt', [StudentAttemptController::class, 'submitAttempt'])->whereNumber('quizId');
Route::post('/student/attempts/{attemptId}/proctor-events', [StudentAttemptController::class, 'storeProctorEvent'])->whereNumber('attemptId');

Route::middleware('auth.token')->group(function (): void {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);

    Route::middleware('role:admin')->group(function (): void {
        Route::get('/admin/dashboard/summary', [DashboardController::class, 'adminSummary']);

        Route::get('/admin/users', [UserManagementController::class, 'index']);
        Route::get('/admin/users/roles/summary', [UserManagementController::class, 'rolesSummary']);
        Route::post('/admin/users', [UserManagementController::class, 'store']);
        Route::put('/admin/users/{userId}', [UserManagementController::class, 'update'])->whereNumber('userId');
        Route::patch('/admin/users/{userId}/status', [UserManagementController::class, 'updateStatus'])->whereNumber('userId');
        Route::delete('/admin/users/{userId}', [UserManagementController::class, 'destroy'])->whereNumber('userId');

        Route::get('/admin/roles', [RolePermissionController::class, 'index']);
        Route::post('/admin/roles', [RolePermissionController::class, 'storeRole']);
        Route::put('/admin/roles/{roleId}', [RolePermissionController::class, 'updateRole'])->whereNumber('roleId');
        Route::delete('/admin/roles/{roleId}', [RolePermissionController::class, 'destroyRole'])->whereNumber('roleId');
        Route::get('/admin/permissions', [RolePermissionController::class, 'permissions']);
        Route::get('/admin/roles/{roleId}/permissions', [RolePermissionController::class, 'showRolePermissions'])->whereNumber('roleId');
        Route::put('/admin/roles/{roleId}/permissions', [RolePermissionController::class, 'assignPermissions'])->whereNumber('roleId');

        Route::get('/admin/quizzes', [QuizManagementController::class, 'index']);
        Route::get('/admin/quizzes/{quizId}', [QuizManagementController::class, 'show'])->whereNumber('quizId');
        Route::post('/admin/quizzes', [QuizManagementController::class, 'store']);
        Route::post('/admin/quizzes/blank', [QuizManagementController::class, 'storeBlankQuiz']);
        Route::put('/admin/quizzes/{quizId}/blank', [QuizManagementController::class, 'updateBlankQuiz'])->whereNumber('quizId');
        Route::put('/admin/quizzes/{quizId}', [QuizManagementController::class, 'update'])->whereNumber('quizId');
        Route::delete('/admin/quizzes/{quizId}', [QuizManagementController::class, 'destroy'])->whereNumber('quizId');
        Route::post('/admin/quizzes/generate-questions', [QuizManagementController::class, 'generateWithAi']);

        Route::get('/admin/rooms', [RoomManagementController::class, 'index']);
        Route::post('/admin/rooms', [RoomManagementController::class, 'store']);
        Route::put('/admin/rooms/{roomId}', [RoomManagementController::class, 'update'])->whereNumber('roomId');
        Route::delete('/admin/rooms/{roomId}', [RoomManagementController::class, 'destroy'])->whereNumber('roomId');
        Route::patch('/admin/rooms/{roomId}/status', [RoomManagementController::class, 'setStatus'])->whereNumber('roomId');
        Route::get('/admin/rooms/assignments', [RoomManagementController::class, 'assignments']);
        Route::post('/admin/rooms/{roomId}/students', [RoomManagementController::class, 'assignStudent'])->whereNumber('roomId');
        Route::post('/admin/rooms/{roomId}/students/bulk', [RoomManagementController::class, 'bulkAssignStudents'])->whereNumber('roomId');
        Route::put('/admin/rooms/{roomId}/students/{studentId}', [RoomManagementController::class, 'updateStudent'])->whereNumber('roomId');
        Route::delete('/admin/rooms/{roomId}/students/{studentId}', [RoomManagementController::class, 'removeStudent'])->whereNumber('roomId');

        Route::get('/admin/attempts', [AttemptManagementController::class, 'index']);
    });

    Route::middleware('role:teacher,instructor')->group(function (): void {
        Route::get('/teacher/dashboard/summary', [DashboardController::class, 'teacherSummary']);
        Route::get('/teacher/quizzes', [QuizManagementController::class, 'index']);
        Route::get('/teacher/quizzes/{quizId}', [QuizManagementController::class, 'show'])->whereNumber('quizId');
        Route::post('/teacher/quizzes', [QuizManagementController::class, 'store']);
        Route::post('/teacher/quizzes/blank', [QuizManagementController::class, 'storeBlankQuiz']);
        Route::put('/teacher/quizzes/{quizId}/blank', [QuizManagementController::class, 'updateBlankQuiz'])->whereNumber('quizId');
        Route::put('/teacher/quizzes/{quizId}', [QuizManagementController::class, 'update'])->whereNumber('quizId');
        Route::delete('/teacher/quizzes/{quizId}', [QuizManagementController::class, 'destroy'])->whereNumber('quizId');
        Route::post('/teacher/quizzes/generate-questions', [QuizManagementController::class, 'generateWithAi']);

        Route::get('/teacher/rooms', [RoomManagementController::class, 'index']);
        Route::post('/teacher/rooms', [RoomManagementController::class, 'store']);
        Route::put('/teacher/rooms/{roomId}', [RoomManagementController::class, 'update'])->whereNumber('roomId');
        Route::delete('/teacher/rooms/{roomId}', [RoomManagementController::class, 'destroy'])->whereNumber('roomId');
        Route::patch('/teacher/rooms/{roomId}/status', [RoomManagementController::class, 'setStatus'])->whereNumber('roomId');
        Route::get('/teacher/rooms/assignments', [RoomManagementController::class, 'assignments']);
        Route::post('/teacher/rooms/{roomId}/students', [RoomManagementController::class, 'assignStudent'])->whereNumber('roomId');
        Route::post('/teacher/rooms/{roomId}/students/bulk', [RoomManagementController::class, 'bulkAssignStudents'])->whereNumber('roomId');
        Route::put('/teacher/rooms/{roomId}/students/{studentId}', [RoomManagementController::class, 'updateStudent'])->whereNumber('roomId');
        Route::delete('/teacher/rooms/{roomId}/students/{studentId}', [RoomManagementController::class, 'removeStudent'])->whereNumber('roomId');

        Route::get('/teacher/attempts', [AttemptManagementController::class, 'index']);
    });
});
