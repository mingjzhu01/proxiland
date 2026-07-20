alter table blocks
  drop constraint blocks_target_id_fkey;

alter table blocks
  add constraint blocks_target_id_fkey
    foreign key (target_id) references profiles (id) on delete cascade;
