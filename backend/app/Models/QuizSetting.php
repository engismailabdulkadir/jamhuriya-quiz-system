<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class QuizSetting extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'quiz_id',
        'delivery_method',
        'require_names',
        'show_question_feedback',
        'show_final_score',
        'fullscreen_required',
        'allow_copy',
        'allow_tab_switch',
    ];

    protected function casts(): array
    {
        return [
            'require_names' => 'boolean',
            'show_question_feedback' => 'boolean',
            'show_final_score' => 'boolean',
            'fullscreen_required' => 'boolean',
            'allow_copy' => 'boolean',
            'allow_tab_switch' => 'boolean',
        ];
    }

    public function quiz(): BelongsTo
    {
        return $this->belongsTo(Quiz::class);
    }
}
