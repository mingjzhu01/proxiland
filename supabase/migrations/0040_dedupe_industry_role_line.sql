-- Founder decision: assemble_line was blindly concatenating industry + role_category with no
-- grammar awareness, producing redundant-sounding pairs like "Investments investor" (industry
-- "investments" glued straight to role "investor"). Fix: when the industry and role words share
-- the same root (first 5 lowercased chars match — catches "investments"/"investor" via their
-- shared "inves" stem without needing a maintained list of every industry/role pair), drop the
-- industry from the core phrase and show the role alone. Only touches the anonymous-card
-- template; no LLM involved here by design (see migration 0015/0036 notes on why).
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
begin
  if p_used_generic then
    return initcap(p_role_category::text);
  end if;

  v_industry_dup := p_industry is not null
    and left(lower(p_industry), 5) = left(lower(p_role_category::text), 5);

  core := trim(concat_ws(' ',
    case when p_keep_stage and p_stage is not null then lower(p_stage) end,
    case when p_keep_industry and not v_industry_dup then lower(p_industry) end,
    lower(p_role_category::text)
  ));
  parts := array_append(parts, core);

  if p_keep_prior_employer and p_prior_employer is not null then
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
