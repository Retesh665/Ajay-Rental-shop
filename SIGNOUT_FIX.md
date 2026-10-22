# Sign-out reliability fix

Source: latest `RentDesk-today-date-fix.zip`.

- Clear React auth state and private photo cache immediately on Sign Out.
- Attempt `rd_end_staff_session` with a 2.5-second timeout so a stalled RPC cannot freeze the button.
- Attempt Supabase local sign-out with a 2.5-second timeout; remove only the project-specific Supabase auth token if local sign-out fails or times out.
- Disable the button during sign-out to avoid duplicate clicks.
- Keep IndexedDB offline drafts/snapshots and all rental calculations untouched.

## Important limitation

When the server is unavailable, local logout works but server-side session revocation cannot be guaranteed. A previously issued token may remain valid until expiration. If a single-session policy requires immediate remote revocation, the server must be reachable.

## Test

1. Sign in and click Sign Out; login screen should appear immediately.
2. Sign in again and disconnect internet; click Sign Out and confirm login screen appears.
3. Restart browser after logout; app should not restore the previous login.
4. Confirm offline drafts remain on the device and cannot be accessed without authentication.
5. With internet available, verify the session revocation RPC executes and the other-device session behavior remains correct.
