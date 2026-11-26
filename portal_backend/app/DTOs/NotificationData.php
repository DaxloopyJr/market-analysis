<?php

namespace App\DTOs;

use DateTimeInterface;

final readonly class NotificationData
{
   public function __construct(
        public int $userId,
        public int $auditEventId,
        public string $type,
        public string $message,
        public bool $isRead = false,
        public ?DateTimeInterface $sentAt = null

    ) {}
}
