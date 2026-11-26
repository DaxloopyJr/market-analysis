<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ListAuditEventsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('audit.read') ?? false;
    }

    public function rules(): array
    {
        return [
            'eventType' => ['sometimes', 'string', 'max:255'],
            'actorType' => ['sometimes', 'string', 'max:255'],
            'userId' => ['sometimes', 'integer', 'min:1'],
            'entityType' => ['sometimes', 'string', 'max:255'],
            'entityId' => ['sometimes', 'string', 'max:255'],
            'requestId' => ['sometimes', 'uuid'],
            'startDate' => ['sometimes', 'date_format:Y-m-d'],
            'endDate' => ['sometimes', 'date_format:Y-m-d', ...($this->has('startDate') ? ['after_or_equal:startDate'] : [])],
            'perPage' => ['sometimes', 'integer', 'between:1,100'],
            'page' => ['sometimes', 'integer', 'min:1'],
        ];
    }
}
