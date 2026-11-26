<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    $frontend = public_path('index.html');

    return file_exists($frontend)
        ? response()->file($frontend, ['Content-Type' => 'text/html'])
        : view('welcome');
});
