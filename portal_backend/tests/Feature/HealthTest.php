<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class HealthTest extends TestCase
{
    /** @test */
    public function test_health_endpoint_returns_success()
    {
        // 1. Tuma GET request kwenda kwenye endpoint ya health
        $response = $this->get('/api/health'); 

        // 2. Hakikisha kuwa HTTP Status ni 200 OK
        $response->assertStatus(200);

        // 3. (Hiari) Hakikisha majibu ya JSON yana muundo unaotegemewa
        $response->assertExactJson([
            'status' => 'success',
            'application' => 'Viwanda Portal',
            'message' => 'Laravel API is working',
        ]);
    }
}
