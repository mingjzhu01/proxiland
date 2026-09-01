-- Two fixes found via App Store review screenshots:
-- 1. Stage slugs (e.g. "series a") were fully lowercased, so mid-sentence text read as
--    "Series a climate founder" — the funding-round term's capital letter looks like a typo
--    without it. Only the whole assembled sentence's first letter was ever re-capitalized.
-- 2. "Healthtech operator, ex healthtech" — industry and prior_employer_industry can be the
--    exact same generalized sector (prior_employer_industry IS already a generalization of the
--    real employer, applied before this function ever sees it — see migration 0036), so the
--    line repeated itself. Same dedupe pattern as migration 0040's industry/role fix, applied
--    to industry/prior-employer this time.
create or replace function assemble_line(
  p_role_category role_category,
  p_industry text,
  p_stage text,
  p_school text,
  p_prior_employer text,
  p_tenure_band text,
  p_keep_industry boolean,
  p_keep_stage boolean,
  p_keep_school boolean,
  p_keep_prior_employer boolean,
  p_keep_tenure_band boolean,
  p_used_generic boolean,
  p_tenure_years_exact int default null
)
returns text
language plpgsql
immutable
as $$
declare
  core text;
  parts text[] := '{}';
  result text;
  v_industry_dup boolean;
  v_prior_employer_dup boolean;
  v_stage_label text;
begin
  if p_used_generic then
    return initcap(p_role_category::text);
  end if;

  v_industry_dup := p_industry is not null
    and left(lower(p_industry), 5) = left(lower(p_role_category::text), 5);

  v_prior_employer_dup := p_prior_employer is not null and p_industry is not null
    and left(lower(p_prior_employer), 5) = left(lower(p_industry), 5);

  v_stage_label := case lower(coalesce(p_stage, ''))
    when 'series a' then 'Series A'
    when 'series b plus' then 'Series B+'
    when 'pre seed' then 'pre-seed'
    else lower(p_stage)
  end;

  core := trim(concat_ws(' ',
    case when p_keep_stage and p_stage is not null then v_stage_label end,
    case when p_keep_industry and not v_industry_dup then lower(p_industry) end,
    lower(p_role_category::text)
  ));
  parts := array_append(parts, core);

  if p_keep_prior_employer and p_prior_employer is not null and not v_prior_employer_dup then
    parts := array_append(parts, 'ex ' || p_prior_employer);
  end if;

  if p_keep_school and p_school is not null then
    parts := array_append(parts, p_school || ' grad');
  end if;

  if p_keep_tenure_band then
    if p_tenure_years_exact is not null then
      parts := array_append(parts, p_tenure_years_exact || 'y experience');
    elsif p_tenure_band is not null then
      parts := array_append(parts, p_tenure_band || ' experience');
    end if;
  end if;

  result := array_to_string(parts, ', ');
  return upper(left(result, 1)) || substring(result from 2);
end;
$$;
