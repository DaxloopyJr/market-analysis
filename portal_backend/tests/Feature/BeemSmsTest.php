<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class BeemSmsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.beem' => [
            'enabled' => true,
            'url' => 'https://apisms.beem.africa/v1/send',
            'api_key' => 'test-key',
            'secret_key' => 'test-secret',
            'sender_id' => 'TEST',
        ]]);
    }

    public function test_otp_is_sent_with_basic_auth_and_normalized_phone(): void
    {
        Http::preventStrayRequests();
        Http::fake(['apisms.beem.africa/*' => Http::response(['successful' => true, 'code' => 100])]);
        foreach (['0712345678', '712345678', '+255 712 345 678'] as $phone) {
            $this->assertTrue(NotificationService::sendOtpSms(new User(['phone' => $phone]), '123456', 'sign-in'));
        }
        Http::assertSentCount(3);
        Http::assertSent(fn ($request) => $request->method() === 'POST'
            && $request->hasHeader('Authorization', 'Basic '.base64_encode('test-key:test-secret'))
            && $request['source_addr'] === 'TEST'
            && $request['recipients'] === [['recipient_id' => '1', 'dest_addr' => '255712345678']]
            && str_contains($request['message'], 'sign-in code: 123456'));
    }

    public function test_provider_rejection_and_malformed_responses_are_not_success(): void
    {
        Http::fake(['*' => Http::sequence()
            ->push(['successful' => false, 'code' => 101])
            ->push(['successful' => true, 'code' => 100], 401)
            ->push(['successful' => true, 'code' => 101])
            ->push('not-json')]);
        for ($attempt = 0; $attempt < 4; $attempt++) {
            $this->assertFalse(NotificationService::sendOtpSms(new User(['phone' => '0712345678']), '123456'));
        }
        Http::assertSentCount(4);
    }

    public function test_disabled_or_missing_configuration_does_not_send(): void
    {
        Http::fake();
        config(['services.beem.enabled' => false]);
        $user = new User(['phone' => '0712345678']);
        $this->assertFalse(NotificationService::sendOtpSms($user, '123456'));
        config(['services.beem.enabled' => true, 'services.beem.secret_key' => '']);
        $this->assertFalse(NotificationService::sendOtpSms($user, '123456'));
        Http::assertNothingSent();
    }

    public function test_invalid_phone_does_not_send(): void
    {
        Http::fake();
        $this->assertFalse(NotificationService::sendOtpSms(new User(['phone' => 'invalid0712345678']), '123456'));
        Http::assertNothingSent();
    }

    public function test_connection_failure_returns_false_without_retry(): void
    {
        $attempts = 0;
        Http::fake(function () use (&$attempts) {
            $attempts++;
            throw new ConnectionException('Connection timed out');
        });
        $this->assertFalse(NotificationService::sendOtpSms(new User(['phone' => '0712345678']), '123456'));
        $this->assertSame(1, $attempts);
    }
}
