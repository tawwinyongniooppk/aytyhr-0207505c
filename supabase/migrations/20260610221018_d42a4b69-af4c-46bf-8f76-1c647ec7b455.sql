with ranked as (
  select id,
         row_number() over (
           partition by user_id, month, title, source
           order by created_at, id
         ) as rn
  from public.salary_manual_deductions
  where source = 'auto_early_out'
)
delete from public.salary_manual_deductions d
using ranked r
where d.id = r.id
  and r.rn > 1;

update public.salary_manual_deductions
set title = regexp_replace(title, '^Auto early-out deduction', 'Forget to Check out')
where source = 'auto_early_out'
  and title like 'Auto early-out deduction (%)';

create unique index if not exists salary_manual_deductions_auto_early_out_once_per_date_idx
on public.salary_manual_deductions (user_id, month, title)
where source = 'auto_early_out';