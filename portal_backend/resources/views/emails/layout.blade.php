<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $subjectLine }}</title>
</head>
<body style="margin:0;padding:0;background:#f3f6fa;font-family:Arial,Helvetica,sans-serif;color:#172b4d;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">{{ $preheader }}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6fa;padding:32px 12px;">
    <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #e1e7ef;border-radius:14px;overflow:hidden;box-shadow:0 8px 30px rgba(23,43,77,.08);">
            <tr><td style="height:5px;background:#1d8a5b;font-size:0;line-height:0;">&nbsp;</td></tr>
            <tr><td style="padding:26px 34px 22px;border-bottom:1px solid #e8edf3;">
                <table role="presentation" cellspacing="0" cellpadding="0"><tr>
                    <td style="width:62px;vertical-align:middle;"><img src="{{ $logoUrl }}" width="54" height="54" alt="{{ $institutionName }} logo" style="display:block;width:54px;height:54px;object-fit:contain;border:0;"></td>
                    <td style="vertical-align:middle;padding-left:14px;">
                        <div style="font-size:19px;line-height:25px;font-weight:700;color:#123a68;">{{ $portalName }}</div>
                        <div style="font-size:12px;line-height:18px;color:#62738a;">{{ $institutionName }}</div>
                    </td>
                </tr></table>
            </td></tr>
            <tr><td style="padding:32px 34px 30px;">
                @yield('content')
            </td></tr>
            <tr><td style="padding:22px 34px 25px;background:#f7f9fc;border-top:1px solid #e8edf3;">
                <div style="font-size:12px;line-height:19px;color:#62738a;">
                    <strong style="color:#344a63;">Need help?</strong><br>
                    Email: <a href="mailto:{{ $contactEmail }}" style="color:#176b87;text-decoration:none;">{{ $contactEmail }}</a>
                    @if($contactPhone)<br>Phone: {{ $contactPhone }}@endif
                    @if($contactAddress)<br>Address: {{ $contactAddress }}@endif
                </div>
                <div style="font-size:11px;line-height:18px;color:#8492a6;padding-top:13px;">This is an automated security message from {{ $portalName }}. Please do not reply to this email.</div>
            </td></tr>
        </table>
        <div style="max-width:620px;padding:16px 8px;font-size:11px;line-height:17px;color:#8492a6;">&copy; {{ date('Y') }} {{ $institutionName }}. All rights reserved.</div>
    </td></tr>
</table>
</body>
</html>
