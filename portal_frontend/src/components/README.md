# Viwanda Portal — Topbar Notification Bell

## Copy files into the project

- `Topbar.jsx` → `src/components/Topbar.jsx`
- `Topbar.css` → `src/components/Topbar.css`

This is a drop-in replacement for the two uploaded files. It **keeps** the landing header,
National Emblem, existing navigation search, sidebar-toggle callback,
My Profile route, logout callback and the rest of the current layout.

## Requirements

- Existing `src/API/Api` Axios client, with `baseURL` resolving to `/api/v1`
  and the authenticated user's Bearer token attached automatically.
- React Router and `lucide-react` already used by the uploaded Topbar.
- Bootstrap spinner classes are reused for dropdown loading.

## API calls

- `GET /notifications/unread-count` — reads the logged-in user's unread count.
- `GET /notifications?page=1&perPage=5` — recent user notifications (no cross-user access).
- `GET /notifications/{id}` — detail view; **does not** mark read.
- `PATCH /notifications/{id}/read` — user explicitly marks read; no request body.

Unread count reloads when the dashboard mounts, on route changes,
when the browser tab gains focus, when the bell opens, and when a
`viwanda:notifications-updated` browser event is received.

## Optional: immediate bell badge update from Notifications.jsx

If the Notifications page marks an item as read while the Topbar stays mounted,
add the following line **after a successful** `PATCH /notifications/{id}/read`:

```jsx
window.dispatchEvent(new Event("viwanda:notifications-updated"));
```

Topbar already listens for this event. Otherwise it will refresh on route changes,
focus, and bell open, so this line is optional.

## UI behavior

- Clicking Bell opens a dropdown instead of navigating immediately.
- Clicking a notification opens a read-only detail view within the dropdown.
- Mark as Read calls the PATCH endpoint, updates the list, and refreshes count.
- View All opens `/dashboard/notifications`.
- Clicking outside or Escape closes the dropdown.
- No mock data, mark-all, delete, or undocumented endpoint.
