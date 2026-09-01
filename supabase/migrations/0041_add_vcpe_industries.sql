-- Founder request: add VCPE, Venture Capital, Private Equity, Public Equity to the industry list.
do $$
declare
  v_constraint_name text;
begin
  select conname into v_constraint_name
  from pg_constraint
  where conrelid = 'profile_attributes'::regclass
    and pg_get_constraintdef(oid) like '%industry%';

  if v_constraint_name is not null then
    execute format('alter table profile_attributes drop constraint %I', v_constraint_name);
  end if;
end $$;

alter table profile_attributes add constraint profile_attributes_industry_check
  check (industry in (
    'fintech', 'finance', 'investments', 'vcpe', 'venture capital', 'private equity',
    'public equity', 'banking', 'insurance', 'insurtech', 'accounting',
    'consulting', 'legal tech', 'law', 'foodtech', 'food beverage', 'agriculture', 'climate',
    'energy', 'renewable energy', 'oil gas', 'mining', 'utilities', 'water', 'waste management',
    'healthtech', 'pharma', 'biotech', 'medical devices', 'healthcare services',
    'wellness fitness', 'logistics', 'transportation', 'shipping', 'aviation', 'automotive',
    'aerospace defense', 'space', 'manufacturing', 'semiconductors', 'hardware', 'robotics',
    'iot', 'consumer', 'retail', 'e-commerce', 'luxury goods', 'beauty cosmetics', 'fashion',
    'enterprise', 'software', 'cloud computing', 'data analytics', 'ai infrastructure',
    'cybersecurity', 'web3', 'gaming', 'esports', 'media', 'entertainment', 'music', 'film',
    'publishing', 'journalism', 'advertising', 'marketing tech', 'public relations',
    'market research', 'edtech', 'education', 'childcare', 'proptech', 'real estate',
    'construction', 'architecture', 'interior design', 'travel', 'hospitality', 'hr tech',
    'staffing recruiting', 'government', 'nonprofit', 'social impact', 'mobility',
    'telecommunications', 'security services', 'environmental services', 'veterinary pet care',
    'senior care', 'sports'
  ));
