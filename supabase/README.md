# business_owners registry index (Supabase project kemvxzhcxvynmoutwdrh)

Schema `business_owners`: `fl_entity`, `fl_officer`, `fl_fictitious`, `fl_license`, `il_llc`, `il_llc_name`, `il_llc_manager`, `api_token`, `load_runs`.
Access is only through token-checked RPCs in `public`: `bo_lookup_fl`, `bo_lookup_fl_license`, `bo_lookup_il`, `bo_fl_cross`, `bo_load`, `bo_truncate`.
The tables have RLS on and no grants to anon/authenticated.

Quarterly refresh:

```bash
FL_SFTP_USER=... FL_SFTP_PASS=... python3 scripts/build_fl_sunbiz.py         # free FL DOS quarterly files
# IL DTA files: the service's ilDta downloader, or IL_DTA_DIR with .extracted/llc*.txt
BO_SUPABASE_URL=... BO_SUPABASE_KEY=... BO_LOAD_TOKEN=... \
  python3 scripts/load_registry_supabase.py --truncate                      # ~15 min, 2 connections
```
