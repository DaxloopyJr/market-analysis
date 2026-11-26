<?php

namespace App\Services;

use App\DTOs\AuditEventData;
use App\Models\PortalSetting;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Throwable;

class PortalSettingsService
{
    private const WRITE_LOCK_KEY = '__portal_settings_write_lock';

    public function __construct(
        private readonly AuditService $auditService,
    ) {}

    public function adminSettings(): array
    {
        $settings = $this->savedSettings();
        $result = [];

        foreach (config('portal_settings') as $key => $definition) {
            $setting = $settings->get($key);

            $result[$key] = [
                'id' => $setting?->id,
                'key' => $key,
                'value' => $this->readValue($setting, $definition),
                'type' => $definition['type'],
                'created_at' => $setting?->created_at,
                'updated_at' => $setting?->updated_at,
            ];

            if ($key === 'logo') {
                $result[$key]['url'] = $this->logoUrl($result[$key]['value']);
            }
        }

        return $result;
    }

    public function publicSettings(): array
    {
        $settings = $this->savedSettings();
        $result = [];

        foreach (config('portal_settings') as $key => $definition) {
            $result[$key] = $this->readValue($settings->get($key), $definition);
        }

        $result['logo_url'] = $this->logoUrl($result['logo']);
        unset($result['logo']);

        if ($result['announcements_enabled'] !== true) {
            $result['announcements'] = [];

            return $result;
        }

        $activeAnnouncements = [];

        foreach ($result['announcements'] as $announcement) {
            if (! is_array($announcement)) {
                continue;
            }

            if (($announcement['is_active'] ?? null) !== true) {
                continue;
            }

            if (! is_string($announcement['title'] ?? null)) {
                continue;
            }

            if (! is_string($announcement['message'] ?? null)) {
                continue;
            }

            $activeAnnouncements[] = [
                'title' => $announcement['title'],
                'message' => $announcement['message'],
            ];

            if (count($activeAnnouncements) >= $result['announcements_limit']) {
                break;
            }
        }

        $result['announcements'] = $activeAnnouncements;

        return $result;
    }

    public function update(array $changes, ?int $actorId, ?string $ipAddress, ?string $requestId): void
    {
        $uploadedLogoPath = null;
        $oldLogoPath = null;

        try {
            DB::transaction(function () use (
                $changes,
                $actorId,
                $ipAddress,
                $requestId,
                &$uploadedLogoPath,
                &$oldLogoPath,
            ): void {
                // The stable row serializes two admins updating a logo that does not yet have its own row.
                DB::table('portal_settings')->insertOrIgnore([
                    'key' => self::WRITE_LOCK_KEY,
                    'type' => 'text',
                    'value' => null,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                DB::table('portal_settings')
                    ->where('key', self::WRITE_LOCK_KEY)
                    ->lockForUpdate()
                    ->first();

                $oldValues = [];
                $newValues = [];

                foreach ($changes as $key => $value) {
                    $definition = config('portal_settings.'.$key);
                    $currentSetting = PortalSetting::query()
                        ->where('key', $key)
                        ->lockForUpdate()
                        ->first();

                    $previousValue = $this->readValue($currentSetting, $definition);

                    if ($key === 'logo') {
                        $oldLogoPath = $previousValue;

                        if ($value instanceof UploadedFile) {
                            $uploadedLogoPath = $value->store('portal', 'public');

                            if (! is_string($uploadedLogoPath)) {
                                throw new RuntimeException('The portal logo could not be stored.');
                            }

                            $value = $uploadedLogoPath;
                        }
                    }

                    if ($key === 'announcements_enabled') {
                        $value = filter_var($value, FILTER_VALIDATE_BOOLEAN);
                    }

                    if ($key === 'announcements_limit') {
                        $value = (int) $value;
                    }

                    if ($key === 'announcements') {
                        foreach ($value as &$announcement) {
                            $announcement['is_active'] = filter_var(
                                $announcement['is_active'],
                                FILTER_VALIDATE_BOOLEAN
                            );
                        }

                        unset($announcement);
                    }

                    if ($previousValue === $value && $currentSetting !== null) {
                        continue;
                    }

                    PortalSetting::setValue($key, $value);

                    $oldValues[$key] = $previousValue;
                    $newValues[$key] = $value;
                }

                if ($newValues === []) {
                    return;
                }

                $this->auditService->record(new AuditEventData(
                    eventType: 'configure',
                    userId: $actorId,
                    actorType: 'user',
                    entityType: 'portal_settings',
                    ipAddress: $ipAddress,
                    requestId: $requestId,
                    oldValues: $oldValues,
                    newValues: $newValues,
                    reason: 'Portal settings updated',
                ));
            });
        } catch (Throwable $error) {
            if ($this->isOwnedLogoPath($uploadedLogoPath)) {
                Storage::disk('public')->delete($uploadedLogoPath);
            }

            throw $error;
        }

        // Files are outside the DB transaction; remove the old one only after a successful commit.
        if ($oldLogoPath !== $uploadedLogoPath && $this->isOwnedLogoPath($oldLogoPath)) {
            try {
                Storage::disk('public')->delete($oldLogoPath);
            } catch (Throwable $error) {
                Log::warning('An older portal logo could not be removed.', [
                    'path' => $oldLogoPath,
                    'error' => $error->getMessage(),
                ]);
            }
        }
    }

    private function savedSettings(): Collection
    {
        return PortalSetting::query()
            ->whereIn('key', array_keys(config('portal_settings')))
            ->get()
            ->keyBy('key');
    }

    private function readValue(?PortalSetting $setting, array $definition): mixed
    {
        if ($setting === null) {
            return $definition['default'];
        }

        $value = $setting->value;

        if ($value === null) {
            return $definition['default'];
        }

        if ($definition['type'] === 'boolean' && ! is_bool($value)) {
            return $definition['default'];
        }

        if ($definition['type'] === 'json' && ! is_array($value)) {
            return $definition['default'];
        }

        if ($definition['type'] === 'integer' && ! is_int($value)) {
            return $definition['default'];
        }

        if (in_array($definition['type'], ['text', 'image'], true) && ! is_string($value)) {
            return $definition['default'];
        }

        if ($setting->key === 'portal_name') {
            if (trim($value) === '' || mb_strlen($value) > 150) {
                return $definition['default'];
            }

            if (preg_match('/[\r\n]/', $value) === 1) {
                return $definition['default'];
            }
        }

        if ($setting->key === 'announcements_limit') {
            if ($value < 1 || $value > 20) {
                return $definition['default'];
            }
        }

        return $value;
    }

    private function logoUrl(mixed $path): ?string
    {
        if (! $this->isOwnedLogoPath($path)) {
            return null;
        }

        if (! Storage::disk('public')->exists($path)) {
            return null;
        }

        $url = Storage::disk('public')->url($path);

        if (str_starts_with($url, 'http://') || str_starts_with($url, 'https://')) {
            return $url;
        }

        return url($url);
    }

    private function isOwnedLogoPath(mixed $path): bool
    {
        if (! is_string($path)) {
            return false;
        }

        return preg_match('/^portal\/[a-zA-Z0-9_-]+\.(?:png|jpe?g|webp)$/', $path) === 1;
    }
}
