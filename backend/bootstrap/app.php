<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Database\QueryException;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
        apiPrefix: env('API_PREFIX', env('VERCEL_ENV') ? '' : 'api'),
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'auth.token' => \App\Http\Middleware\AuthTokenMiddleware::class,
            'role' => \App\Http\Middleware\EnsureRoleMiddleware::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request, \Throwable $e): bool => $request->is('api/*') || $request->expectsJson()
        );

        $exceptions->render(function (ValidationException $exception, Request $request) {
            if (!$request->is('api/*')) {
                return null;
            }

            return response()->json([
                'message' => 'Validation failed.',
                'errors' => $exception->errors(),
            ], 422);
        });

        $exceptions->render(function (\Throwable $exception, Request $request) {
            if (!$request->is('api/*')) {
                return null;
            }

            if ($exception instanceof QueryException) {
                $message = strtolower($exception->getMessage());

                if (str_contains($message, 'access denied')) {
                    return response()->json([
                        'message' => 'Database access denied. Check DB_USERNAME and DB_PASSWORD in backend/.env.',
                    ], 500);
                }

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

            $statusCode = $exception instanceof HttpExceptionInterface
                ? $exception->getStatusCode()
                : 500;

            if ($statusCode < 400 || $statusCode >= 600) {
                $statusCode = 500;
            }

            return response()->json([
                'message' => $statusCode >= 500 ? 'Server error.' : ($exception->getMessage() ?: 'Request failed.'),
            ], $statusCode);
        });
    })->create();
