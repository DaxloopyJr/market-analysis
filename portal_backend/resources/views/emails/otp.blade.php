@extends('emails.layout')

@section('content')
    <div style="font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#1d8a5b;padding-bottom:10px;">Account security</div>
    <h1 style="margin:0 0 16px;font-size:25px;line-height:32px;color:#123a68;">{{ $heading }}</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:24px;">Hello {{ $user->name }},</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:24px;color:#455a74;">{{ $intro }}</p>
    <div style="margin:24px 0;padding:20px;text-align:center;background:#f0f7f4;border:1px solid #cde6da;border-radius:10px;">
        <div style="font-size:12px;line-height:18px;color:#527064;text-transform:uppercase;letter-spacing:1px;">Your verification code</div>
        <div style="font-size:34px;line-height:46px;font-weight:700;letter-spacing:8px;color:#123a68;font-family:Consolas,Monaco,monospace;">{{ $code }}</div>
    </div>
    <p style="margin:0 0 10px;font-size:14px;line-height:22px;color:#455a74;">This code expires in <strong>10 minutes</strong>. Enter it on the portal to continue.</p>
    <p style="margin:0;font-size:13px;line-height:21px;color:#718096;">If you did not request this code, do not share it and contact the portal administrator.</p>
@endsection
