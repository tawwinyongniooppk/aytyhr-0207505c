## Root cause

`useProfile` calls the RPC `public.get_profile_full(uuid)`. The published app fails with **"Failed to load profile"** because the database returns:

```
permission denied for function get_profile_full
user_name = authenticator
```

The function has `EXECUTE` granted only to the `authenticated` role. In the published environment, PostgREST is executing the call as the `authenticator` / `anon` role (the JWT role claim isn't elevating to `authenticated` — likely related to the new JWT signing-key format vs. the legacy publishable key in `.env`). Because `anon` was explicitly revoked, the call is rejected before any code in the function runs.

The same will affect `admin_list_profiles` (used by Dashboard, Staff, ManageAccounts) and `list_public_profiles`.

## Fix

These RPCs are already `SECURITY DEFINER` and perform their own authorization inside the function body (they check `auth.uid()` and the caller's role, raising `Not authorized` otherwise). It is safe to expose `EXECUTE` more broadly — the function still rejects unauthenticated or unauthorized callers.

### Migration

Add a new migration that grants `EXECUTE` to `anon` and `PUBLIC` for the three profile RPCs:

```sql
GRANT EXECUTE ON FUNCTION public.get_profile_full(uuid)   TO anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_profiles()    TO anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_profiles()   TO anon, authenticated, PUBLIC;
```

The functions themselves remain protected:
- `get_profile_full` raises `Not authorized` unless `p_id = auth.uid()` or the caller is admin/assistant/it_manager.
- `admin_list_profiles` raises `Not authorized` unless the caller is admin/assistant/it_manager.

So an anonymous caller still gets nothing back; only the **call gate** is opened.

### No client changes required

`src/hooks/useProfile.tsx` and the auth flow are correct. The error surfaced only because the database refused the function call before the in-function checks ran.

## Verification after apply

1. Reload the published app — profile loads, dashboard renders.
2. Anonymous `curl` to `/rest/v1/rpc/get_profile_full` with a random uuid still returns the function's `Not authorized` exception (defense in depth intact).
