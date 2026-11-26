Hello {{ $user->name }},

{{ $intro }}: {{ $code }}

It expires in 10 minutes. If you did not request it, ignore this message.

Need help? Email: {{ $contactEmail }}@if($contactPhone) | Phone: {{ $contactPhone }}@endif

{{ $portalName }} — {{ $institutionName }}
