<?php

namespace Tests\Feature;

use App\Http\Middleware\CheckPermission;
use App\Models\User;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class CheckPermissionMiddlewareTest extends TestCase
{
    public function test_middleware_allows_user_with_any_one_of_the_listed_permissions(): void
    {
        $user = \Mockery::mock(User::class);
        $user->shouldReceive('getAttribute')->with('is_active')->andReturn(true);
        $user->shouldReceive('getAttribute')->with('status')->andReturn('active');
        $user->shouldReceive('canDo')->once()->with('institutions.manage')->andReturn(false);
        $user->shouldReceive('canDo')->once()->with('institutions.view.own')->andReturn(true);
        $request = Request::create('/api/_test/permission');
        $request->setUserResolver(fn () => $user);

        $response = (new CheckPermission)->handle(
            $request,
            fn () => response()->json(['allowed' => true]),
            'institutions.manage',
            'institutions.view.own',
        );

        $this->assertSame(['allowed' => true], $response->getData(true));
    }

    public function test_middleware_denies_user_without_any_listed_permission(): void
    {
        $user = \Mockery::mock(User::class);
        $user->shouldReceive('getAttribute')->with('is_active')->andReturn(true);
        $user->shouldReceive('getAttribute')->with('status')->andReturn('active');
        $user->shouldReceive('canDo')->once()->with('institutions.manage')->andReturn(false);
        $user->shouldReceive('canDo')->once()->with('institutions.view.own')->andReturn(false);
        $request = Request::create('/api/_test/permission');
        $request->setUserResolver(fn () => $user);

        try {
            (new CheckPermission)->handle(
                $request,
                fn () => response()->noContent(),
                'institutions.manage',
                'institutions.view.own',
            );
            $this->fail('The request should be forbidden.');
        } catch (HttpException $exception) {
            $this->assertSame(403, $exception->getStatusCode());
        }
    }

    public function test_permission_middleware_alias_is_registered(): void
    {
        $this->assertSame(
            CheckPermission::class,
            app('router')->getMiddleware()['permission'],
        );
    }
}
