Hello {{ $user->name }},

{{ $intro }}

Open this link to {{ $actionInstruction }} (expires in 24 hours):
{{ $actionUrl }}

If you were not expecting this, ignore this email.

Need help? Email: {{ $contactEmail }}@if($contactPhone) | Phone: {{ $contactPhone }}@endif

{{ $portalName }} — {{ $institutionName }}
