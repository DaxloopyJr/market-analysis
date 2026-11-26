@extends('emails.layout')

@section('content')
    <div style="font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#1d8a5b;padding-bottom:10px;">Account access</div>
    <h1 style="margin:0 0 16px;font-size:25px;line-height:32px;color:#123a68;">{{ $heading }}</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:24px;">Hello {{ $user->name }},</p>
    <p style="margin:0 0 22px;font-size:15px;line-height:24px;color:#455a74;">{{ $intro }}</p>
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:4px 0 24px;"><tr><td style="border-radius:7px;background:#176b87;"><a href="{{ $actionUrl }}" style="display:inline-block;padding:13px 24px;font-size:14px;line-height:18px;font-weight:700;color:#ffffff;text-decoration:none;">{{ $actionText }}</a></td></tr></table>
    <p style="margin:0 0 12px;font-size:13px;line-height:21px;color:#455a74;">This secure link expires in <strong>24 hours</strong>.</p>
    <p style="margin:0;font-size:12px;line-height:20px;color:#718096;word-break:break-all;">If the button does not work, copy this link into your browser:<br><a href="{{ $actionUrl }}" style="color:#176b87;">{{ $actionUrl }}</a></p>
@endsection
