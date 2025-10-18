## Admin Panel: guide and logic

This document describes access, roles, UI sections, key scenarios, and backend routes of the admin panel. Response formats and logic invariants are provided. UI is English‑only (no i18n keys or runtime localization).

### Access and roles

- **Roles**: `super_admin`, `admin_view`, `court_admin`, `player` (legacy single `role`, new contract uses array `roles`).
- **UI access**: `/admin` is available to users with `super_admin` or `admin_view` (client guard in `AdminLayout`).
- **Server middleware**:
  - Base auth: `auth` for all admin routes.
  - View: `requireAdminView` (allows `admin_view` and `super_admin`).
  - Full actions: `requireSuperAdmin`.
  - Court access control: `requireCourtAccess` (allows `super_admin` or `court_admin` only for owned/managed courts).
  - Logging: `logAdminAction(action)` enriches request and logs.

Security invariants:
- Cannot change your own roles / delete / block yourself.
- Cannot delete/block another `super_admin`.
- Blocked users fail permission checks.

### UI navigation

Routes within `/admin` (see `src/App.jsx` and `src/layouts/AdminLayout.jsx`):
- Overview: `/admin/overview` — summary dashboard.
- Users: `/admin/users` — search/filters/actions on users.
- Matches: `/admin/matches` — list and administrative actions.
- Courts: `/admin/courts` — CRUD and access control.
- Analytics: `/admin/analytics` — user and match metrics.
- Settings: `/admin/settings` — system parameters (DB stub).
- External court manager: `/court-manager` — separate module.

Section components (`src/components/admin/*`): `OverviewPanel`, `UsersPanel`, `MatchesPanel`, `CourtsPanel`, `AnalyticsPanel`, `SettingsPanel`.

Frontend API pattern: always use `authFetch` from `utils/api.js`; handle `res.ok` then `res.json()`. Errors/messages are in English.

### Users

UI: filters `search`, `role`, `isBlocked`, pagination. Actions: view stats, change roles/notes, block/unblock, delete (actions other than view require permissions; `admin_view` is read‑only).

Backend routes (`backend/routes/admin.js`):
- GET `/api/admin/users` — список пользователей с фильтрами, сортировкой и пагинацией.
  - Query: `page`, `limit`, repeatable `role`, `isBlocked`, `search`, `sortBy`, `sortOrder`.
  - Response:
    ```json
    { "items": [ ... ], "users": [ ... ], "total": 0, "totalPages": 0, "currentPage": 1 }
    ```
  - Normalization: server returns `roles` (array) and a compatible `role`.

- GET `/api/admin/users/:id/stats` — агрегированная статистика пользователя: созданные/участие/подтверждения, head‑to‑head, win%.

- PUT `/api/admin/users/:id/role` — update roles/notes/permissions/managedCourts.
  - Body: `{ roles?: string[], role?: string, notes?: string, permissions?, managedCourts? }`
  - Role validation: must be in `['player','court_admin','admin_view','super_admin']`.
  - Constraint: cannot modify yourself.

- POST `/api/admin/users/:id/block` — блокировка (с причиной).
- POST `/api/admin/users/:id/unblock` — разблокировка.
- DELETE `/api/admin/users/:id` — удаление (каскадная очистка участий и отмена созданных матчей).
- POST `/api/admin/users/:id/reset-password` — смена пароля (хеширование `bcrypt`).
- POST `/api/admin/users/merge` — объединение двух аккаунтов: перенос ratingHistory, обновление ссылок в матчах, удаление вторичного.

Export:
- GET `/api/admin/export/users` — JSON with user data (no sensitive fields) + filename.

Key logic:
- UI forbids editing own roles; server revalidates.
- Blocking/unblocking writes a `notes` entry.
- Deleting a user updates matches as needed.

### Matches

UI: filters `search`, `status`, `isPrivate`, pagination. Actions: force cancel and delete (only for `super_admin`; `admin_view` is read‑only).

Backend routes (`backend/routes/admin.js`):
- GET `/api/admin/matches` — список матчей (populate creator/participants), стандартная пагинация.
- POST `/api/admin/matches/:id/cancel` — force cancel (optional reason added to description).
- DELETE `/api/admin/matches/:id` — force delete: deletes result, cleans participants' ratingHistory, removes the match.
- PUT `/api/admin/matches/:id/result` — set/update result and switch status to `finished`.

Export:
- GET `/api/admin/export/matches` — JSON list of matches + filename.

### Analytics (Overview and Analytics)

- Overview: GET `/api/admin/analytics/overview` + `/api/admin/analytics/activity`.
  - Returns totals across users/matches/results, last‑30‑days activity, role distribution (incl. active/blocked), and match status distribution (including zero categories).
- Users analytics: GET `/api/admin/analytics/users` — registrations by month, top‑10 by rating, number blocked.
- Matches analytics: GET `/api/admin/analytics/matches` — matches by month, popular courts, average participants.

Invariants:
- Active user calculations include multiple activity types (participation, creation, result confirmations, login).
- Role compatibility: aggregations account for legacy `role`.

### Courts

UI: list with filters `search`, `status`, pagination; create/edit; attributes: status, type (paid/free), prices €/h, coordinates, opening hours by day, owner/manager. `admin_view` is read‑only. Separate `CourtCalendar` visualizes slots.

Backend routes (`backend/routes/courts.js`): prefix `/api/admin/courts`.
- GET `/` — list courts (only `super_admin`).
- GET `/mine` — courts managed by `court_admin` (via `managedCourts`).
- GET `/:id` — court details (`requireCourtAccess`).
- POST `/` — create (only `super_admin`).
- PUT `/:id` — update (`requireCourtAccess`).
- DELETE `/:id` — delete (`requireCourtAccess`).
- POST `/:id/assign-manager` — assign manager (only `super_admin`).
- POST `/:id/assign-owner` — assign owner (only `super_admin`).
- GET `/:id/stats` — court stats (`requireCourtAccess`).
- Scheduling/reservations:
  - GET `/:id/schedule` — schedule,
  - POST `/:id/reservations` — create reservation,
  - PUT `/:id/reservations/:reservationId` — update,
  - DELETE `/:id/reservations/:reservationId` — delete.

Court UI contract (important):
- Prices: for compatibility send both `price` (legacy) and new `priceOneHourEUR`/`priceTwoHoursEUR`.
- Coordinates: `[lat, lng]`.
- Validations: when `isPaid` is true, both prices are required.

### Settings

UI edits parameters (DB stub):
- `maxMatchDuration`, `resultConfirmationHours`, `matchCancellationHours`, `maxParticipants`, `defaultRating`, `emailNotifications`.
Backend (`adminController`):
- GET `/api/admin/settings` — returns defaults.
- PUT `/api/admin/settings` — echo‑saves provided object.

### Response formats and errors

We use a single, consistent format:
- Lists: `{ items: [], total, totalPages, currentPage }` (and compatible aliases like `users`, `matches`).
- Single item: `{ item: {}, message? }`.
- Actions: `{ success: true, message }`.
- Errors: HTTP status and body `{ error: 'English message', code, details? }`.

Logging:
- Errors: `console.error('❌ Error ...')`.
- Validation: `console.error('💥 Validation error:', details)`.
- Admin actions: `console.log('Admin action:', req.adminAction)`.

### Client logic and UX rules

- All requests go through `authFetch`. Do not create wrappers.
- Handle `res.ok`, then `res.json()`. Errors are logged and displayed in English.
- Pagination and filters are resilient to empty arrays.
- `admin_view` sees interfaces but cannot mutate (edit/delete).

### Scenario examples

1) Promote a user to `court_admin`:
   - UI: open "Edit user" modal, select roles `['court_admin']`, save.
   - API: `PUT /api/admin/users/:id/role` with `{ roles: ['court_admin'], role: 'court_admin' }`.
   - Constraint: cannot modify yourself; server validates roles.

2) Force-cancel a match:
   - UI: open "Cancel" action in `MatchesPanel`, provide a reason.
   - API: `POST /api/admin/matches/:id/cancel` with `{ reason }`.
   - Result: status `cancelled`, reason appended to description.

3) Create a paid court:
   - UI: fill the form, enable `isPaid`, set `price1hEUR` and `price2hEUR`.
   - API: `POST /api/admin/courts` with both `price` (legacy) and `priceOneHourEUR`/`priceTwoHoursEUR`.
   - Access: only `super_admin`.

4) Data export:
   - Users: GET `/api/admin/export/users` → download `*.json`.
   - Matches: GET `/api/admin/export/matches` → download `*.json`.

### Technical notes

- Role compatibility: server normalizes `roles` and `role` for legacy clients.
- Analytics adds zero categories (e.g., match status) for stable UI.
- Logging can be extended by replacing `console.log` with a persistent store (DB/ELK) in `logAdminAction`.

### Testing and smoke checks

- Login with `admin_view` and `super_admin` (UI guards and server middleware).
- Run CRUD flows for users/matches/courts on test data.
- Validations: roles, paid court prices, self-edit restriction.
- Export — files download and contain expected fields.


