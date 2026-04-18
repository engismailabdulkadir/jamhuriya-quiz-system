<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Quiz extends Model
{
    protected $fillable = [
        'instructor_id',
        'room_id',
        'title',
        'description',
        'cover_image_path',
        'cover_image_meta',
        'cover_video_url',
        'cover_video_meta',
        'time_limit_seconds',
        'shuffle_questions',
        'shuffle_options',
        'allow_back_navigation',
        'max_attempts',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'shuffle_questions' => 'boolean',
            'shuffle_options' => 'boolean',
            'allow_back_navigation' => 'boolean',
            'time_limit_seconds' => 'integer',
            'max_attempts' => 'integer',
            'cover_image_meta' => 'array',
            'cover_video_meta' => 'array',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function instructor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'instructor_id');
    }

    public function settings(): HasOne
    {
        return $this->hasOne(QuizSetting::class);
    }

    public function questions(): HasMany
    {
        return $this->hasMany(Question::class);
    }
}
