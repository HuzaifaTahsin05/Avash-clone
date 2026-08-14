-- docs/PROJECT_PLAN.md §4.1 — RLS is on for every table by default; a
-- table without RLS enabled must have an ADR justifying it (none exist,
-- so all 11 product tables below are enabled). Rows not covered by any
-- permissive policy are denied by default — that is how the "no policy
-- stated" tables below end up locked to the service role.

alter table regions enable row level security;
alter table weather_observations enable row level security;
alter table dengue_cases enable row level security;
alter table risk_predictions enable row level security;
alter table breeding_reports enable row level security;
alter table hospitals enable row level security;
alter table blood_inventory enable row level security;
alter table verified_hospital_staff enable row level security;
alter table alert_subscriptions enable row level security;
alter table push_subscriptions enable row level security;
alter table news_items enable row level security;

-- regions — reference data, public read, no client writes.
create policy regions_select_public on regions for select using (true);

-- weather_observations — feature/chart source, public read, no client writes.
create policy weather_observations_select_public on weather_observations for select using (true);

-- dengue_cases — historical ground truth, public read, no client writes.
create policy dengue_cases_select_public on dengue_cases for select using (true);

-- risk_predictions — public select (§4.1); written only by the batch-predict
-- job via the service-role key, which bypasses RLS entirely.
create policy risk_predictions_select_public on risk_predictions for select using (true);

-- breeding_reports (§4.1 exactly).
create policy breeding_reports_insert_any on breeding_reports for insert with check (true);
create policy breeding_reports_select_verified_or_own on breeding_reports for select
  using (status = 'verified' or reporter_id = auth.uid());
create policy breeding_reports_update_moderation on breeding_reports for update
  using (auth.role() in ('moderator', 'admin'));

-- hospitals — public select (§4.1); write access is admin-only per
-- docs/data-schema/rls-policies.md (new listings are admin-curated).
create policy hospitals_select_public on hospitals for select using (true);
create policy hospitals_insert_admin on hospitals for insert with check (auth.role() = 'admin');
create policy hospitals_update_admin on hospitals for update using (auth.role() = 'admin');
create policy hospitals_delete_admin on hospitals for delete using (auth.role() = 'admin');

-- blood_inventory (§4.1): select is public (required for the ADR-010
-- Realtime subscription); insert/update are restricted to hospital staff
-- verified for that specific hospital. No delete policy — the row
-- lifecycle is create-then-update, no delete path
-- (docs/data-schema/rls-policies.md).
create policy blood_inventory_select_public on blood_inventory for select using (true);
create policy blood_inventory_insert_verified_staff on blood_inventory for insert
  with check (
    auth.uid() in (
      select user_id from verified_hospital_staff
      where hospital_id = blood_inventory.hospital_id
    )
  );
create policy blood_inventory_update_verified_staff on blood_inventory for update
  using (
    auth.uid() in (
      select user_id from verified_hospital_staff
      where hospital_id = blood_inventory.hospital_id
    )
  );

-- verified_hospital_staff — no §4.1 row; stance per
-- docs/data-schema/rls-policies.md (the human-readable contract this
-- migration is written against). Staff can see their own verification
-- row; broad visibility, granting, and revoking are admin-only.
create policy verified_hospital_staff_select on verified_hospital_staff for select
  using (auth.role() = 'admin' or user_id = auth.uid());
create policy verified_hospital_staff_insert_admin on verified_hospital_staff for insert
  with check (auth.role() = 'admin');
create policy verified_hospital_staff_delete_admin on verified_hospital_staff for delete
  using (auth.role() = 'admin');
-- No update policy: the table has no mutable columns beyond its
-- composite primary key (docs/data-schema/rls-policies.md).

-- alert_subscriptions, push_subscriptions (§4.1): owner-only, every operation.
create policy alert_subscriptions_owner_all on alert_subscriptions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy push_subscriptions_owner_all on push_subscriptions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- news_items — no §4.1 row; stance per docs/data-schema/rls-policies.md.
-- Unreviewed AI-classified output must never be publicly visible before
-- human review (§5.4) — only reviewed=true rows are public; unreviewed
-- rows are moderator/admin-only. Insert is service-role only (the
-- news-scan job); update/delete are the moderation workflow.
create policy news_items_select_reviewed_public on news_items for select
  using (reviewed = true or auth.role() in ('moderator', 'admin'));
create policy news_items_update_moderation on news_items for update
  using (auth.role() in ('moderator', 'admin'));
create policy news_items_delete_admin on news_items for delete
  using (auth.role() = 'admin');
