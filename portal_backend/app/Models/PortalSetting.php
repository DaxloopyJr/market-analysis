<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use InvalidArgumentException;
use JsonException;

class PortalSetting extends Model
{
    protected $fillable = [
        'key',
        'value',
        'type',
    ];

    public function getValueAttribute(?string $value): mixed
    {
        if ($value === null) {
            return null;
        }

        $type = $this->attributes['type'] ?? 'text';
        $knownType = config('portal_settings.'.($this->attributes['key'] ?? '').'.type');

        if (is_string($knownType)) {
            $type = $knownType;
        }

        return match ($type) {
            'boolean' => filter_var($value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE),
            'integer' => filter_var($value, FILTER_VALIDATE_INT, FILTER_NULL_ON_FAILURE),
            'number' => is_numeric($value) ? (float) $value : null,
            'json' => $this->decodeJson($value),
            default => $value,
        };
    }

    public function setValueAttribute(mixed $value): void
    {
        if ($value === null) {
            $this->attributes['value'] = null;

            return;
        }

        $type = $this->attributes['type'] ?? 'text';
        $knownType = config('portal_settings.'.($this->attributes['key'] ?? '').'.type');

        if (is_string($knownType)) {
            $type = $knownType;
        }

        $this->attributes['value'] = match ($type) {
            'boolean' => $this->encodeBoolean($value),
            'integer' => $this->encodeInteger($value),
            'number' => $this->encodeNumber($value),
            'json' => json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
            default => $this->encodeText($value),
        };
    }

    public static function getValue(string $key, mixed $default = null): mixed
    {
        // DB is the source of truth: a failed settings transaction must never leave a cached value behind.
        $setting = static::query()->where('key', $key)->first();

        if ($setting === null || $setting->value === null) {
            return $default;
        }

        $value = $setting->value;

        if ($key === 'portal_name') {
            if (! is_string($value) || trim($value) === '') {
                return $default;
            }

            if (mb_strlen($value) > 150 || preg_match('/[\r\n]/', $value) === 1) {
                return $default;
            }
        }

        return $value;
    }

    public static function setValue(string $key, mixed $value): void
    {
        $type = config('portal_settings.'.$key.'.type');

        if (! is_string($type)) {
            throw new InvalidArgumentException('Unknown portal setting.');
        }

        $setting = static::query()->firstOrNew([
            'key' => $key,
        ]);

        $setting->type = $type;
        $setting->value = $value;
        $setting->save();
    }

    private function decodeJson(string $value): ?array
    {
        try {
            $decoded = json_decode($value, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            return null;
        }

        return is_array($decoded) ? $decoded : null;
    }

    private function encodeBoolean(mixed $value): string
    {
        if (! is_bool($value)) {
            throw new InvalidArgumentException('A boolean portal setting requires true or false.');
        }

        return $value ? '1' : '0';
    }

    private function encodeInteger(mixed $value): string
    {
        if (! is_int($value)) {
            throw new InvalidArgumentException('An integer portal setting requires an integer.');
        }

        return (string) $value;
    }

    private function encodeNumber(mixed $value): string
    {
        if ((! is_int($value) && ! is_float($value)) || ! is_finite((float) $value)) {
            throw new InvalidArgumentException('A numeric portal setting requires a finite number.');
        }

        return (string) $value;
    }

    private function encodeText(mixed $value): string
    {
        if (! is_string($value)) {
            throw new InvalidArgumentException('A text portal setting requires a string.');
        }

        return $value;
    }
}
