<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Question extends Model
{
    protected $fillable = [
        'quiz_id',
        'question_type',
        'prompt',
        'points',
        'order_no',
        'explanation',
        'image_path',
        'image_meta',
        'video_url',
        'video_meta',
    ];

    protected function casts(): array
    {
        return [
            'points' => 'float',
            'order_no' => 'integer',
            'image_meta' => 'array',
            'video_meta' => 'array',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function quiz(): BelongsTo
    {
        return $this->belongsTo(Quiz::class);
    }

    public function options(): HasMany
    {
        return $this->hasMany(QuestionOption::class);
    }
}
