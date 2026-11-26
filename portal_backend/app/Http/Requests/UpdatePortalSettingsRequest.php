<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class UpdatePortalSettingsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->canDo('portal_settings.manage') ?? false;
    }

    public function rules(): array
    {
        return [
            'settings' => [
                'required',
                'array:portal_name,contact_email,contact_phone,contact_address,logo,announcements_enabled,announcements_limit,announcements',
                'min:1',
            ],
            'settings.portal_name' => [
                'sometimes',
                'required',
                'string',
                'max:150',
                'not_regex:/[\r\n]/',
            ],
            'settings.contact_email' => [
                'sometimes',
                'nullable',
                'email:rfc',
                'max:254',
            ],
            'settings.contact_phone' => [
                'sometimes',
                'nullable',
                'string',
                'max:30',
                'regex:/^\+?[0-9 ()\-.]+$/',
            ],
            'settings.contact_address' => [
                'sometimes',
                'nullable',
                'string',
                'max:500',
            ],
            'settings.logo' => [
                'sometimes',
                'nullable',
                'image',
                'mimes:jpg,jpeg,png,webp',
                'max:2048',
                'dimensions:max_width=2000,max_height=2000',
            ],
            'settings.announcements_enabled' => [
                'sometimes',
                'required',
                'boolean',
            ],
            'settings.announcements_limit' => [
                'sometimes',
                'required',
                'integer',
                'between:1,20',
            ],
            'settings.announcements' => [
                'sometimes',
                'required',
                'array',
                'list',
                'max:20',
            ],
            'settings.announcements.*' => [
                'required',
                'array:title,message,is_active',
            ],
            'settings.announcements.*.title' => [
                'required',
                'string',
                'max:150',
            ],
            'settings.announcements.*.message' => [
                'required',
                'string',
                'max:2000',
            ],
            'settings.announcements.*.is_active' => [
                'required',
                'boolean',
            ],
        ];
    }

    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if ($validator->errors()->has('settings.contact_phone')) {
                    return;
                }

                $phone = $this->input('settings.contact_phone');

                if (! is_string($phone)) {
                    return;
                }

                $digits = preg_replace('/\D/', '', $phone);
                $digitCount = strlen($digits);

                if ($digitCount < 7 || $digitCount > 15) {
                    $validator->errors()->add(
                        'settings.contact_phone',
                        'The contact phone must contain between 7 and 15 digits.'
                    );
                }
            },
        ];
    }
}
