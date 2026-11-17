create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-F0-9]{6}$'),
  status text not null default 'waiting' check (status in ('waiting','playing','finished')),
  host_id uuid not null references auth.users(id) on delete cascade,
  time_limit_ms integer not null check (time_limit_ms in (300000,600000,900000,1800000)),
  current_player_id uuid references auth.users(id),
  turn_started_at timestamptz,
  turn_no integer not null default 1,
  board jsonb not null default '{}'::jsonb,
  bag_count integer not null default 86,
  consecutive_scoreless integer not null default 0,
  winner_id uuid references auth.users(id),
  end_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.room_players (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  seat smallint not null check (seat in (1,2)),
  display_name text not null check (char_length(display_name) between 1 and 20),
  ready boolean not null default false,
  score integer not null default 0,
  remaining_ms integer not null,
  joined_at timestamptz not null default now(),
  primary key (room_id,user_id),
  unique (room_id,seat)
);

create table if not exists public.game_private (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  bag text[] not null,
  racks jsonb not null
);

create table if not exists public.moves (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  turn_no integer not null,
  player_id uuid not null references auth.users(id),
  move_type text not null check (move_type in ('word','pass','resign','timeout')),
  word text,
  score integer not null default 0,
  placements jsonb,
  created_at timestamptz not null default now()
);

create index if not exists room_players_user_idx on public.room_players(user_id);
create index if not exists moves_room_idx on public.moves(room_id,turn_no);

create table if not exists public.valid_words (
  word text primary key check (word ~ '^[a-z]{2,15}$')
);

alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.game_private enable row level security;
alter table public.moves enable row level security;
alter table public.valid_words enable row level security;

create or replace function public.is_room_member(p_room_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.room_players where room_id=p_room_id and user_id=auth.uid());
$$;

create or replace function public.is_valid_word(p_word text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.valid_words where word=lower(p_word));
$$;

create policy "members read rooms" on public.rooms for select to authenticated using (public.is_room_member(id));
create policy "members read players" on public.room_players for select to authenticated using (public.is_room_member(room_id));
create policy "members read moves" on public.moves for select to authenticated using (public.is_room_member(room_id));

create or replace function public.letter_score(p_letter text)
returns integer language sql immutable as $$
  select case upper(p_letter)
    when 'A' then 1 when 'B' then 3 when 'C' then 3 when 'D' then 2 when 'E' then 1
    when 'F' then 4 when 'G' then 2 when 'H' then 4 when 'I' then 1 when 'J' then 8
    when 'K' then 5 when 'L' then 1 when 'M' then 3 when 'N' then 1 when 'O' then 1
    when 'P' then 3 when 'Q' then 10 when 'R' then 1 when 'S' then 1 when 'T' then 1
    when 'U' then 1 when 'V' then 4 when 'W' then 4 when 'X' then 8 when 'Y' then 4
    when 'Z' then 10 else 0 end;
$$;

create or replace function public.premium_at(p_row integer,p_col integer)
returns text language plpgsql immutable as $$
declare p text := p_row||'-'||p_col;
begin
  if p=any(array['0-0','0-7','0-14','7-0','7-14','14-0','14-7','14-14']) then return 'triple-word'; end if;
  if p=any(array['1-1','2-2','3-3','4-4','10-10','11-11','12-12','13-13','1-13','2-12','3-11','4-10','10-4','11-3','12-2','13-1','7-7']) then return 'double-word'; end if;
  if p=any(array['1-5','1-9','5-1','5-5','5-9','5-13','9-1','9-5','9-9','9-13','13-5','13-9']) then return 'triple-letter'; end if;
  if p=any(array['0-3','0-11','2-6','2-8','3-0','3-7','3-14','6-2','6-6','6-8','6-12','7-3','7-11','8-2','8-6','8-8','8-12','11-0','11-7','11-14','12-6','12-8','14-3','14-11']) then return 'double-letter'; end if;
  return '';
end $$;

create or replace function public.shuffled_bag()
returns text[] language sql volatile as $$
  select array_agg(letter order by random()) from unnest(string_to_array(
    'A,A,A,A,A,A,A,A,A,A,A,A,A,A,A,A,B,B,B,B,C,C,C,D,D,D,D,D,E,E,E,E,E,E,E,E,F,F,G,G,G,G,G,H,H,H,H,I,I,I,I,I,I,I,I,I,I,J,K,K,K,K,L,L,L,L,L,M,M,M,M,M,N,N,N,N,N,N,N,N,N,O,O,O,O,O,O,P,P,P,P,Q,R,R,R,R,R,R,R,S,S,S,S,S,S,S,T,T,T,T,T,T,U,U,U,U,U,U,V,V,W,W,X,Y,Y,Z',','
  )) as letter;
$$;

create or replace function public.create_room(p_name text,p_time_limit_ms integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_room public.rooms; v_code text;
begin
  if auth.uid() is null then raise exception 'Sesi guest tidak valid.'; end if;
  if char_length(trim(p_name)) not between 1 and 20 then raise exception 'Nama harus 1 sampai 20 karakter.'; end if;
  if p_time_limit_ms not in (300000,600000,900000,1800000) then raise exception 'Pilihan waktu tidak valid.'; end if;
  loop
    v_code:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
    exit when not exists(select 1 from public.rooms where code=v_code);
  end loop;
  insert into public.rooms(code,host_id,time_limit_ms) values(v_code,auth.uid(),p_time_limit_ms) returning * into v_room;
  insert into public.room_players(room_id,user_id,seat,display_name,remaining_ms) values(v_room.id,auth.uid(),1,trim(p_name),p_time_limit_ms);
  return jsonb_build_object('room_id',v_room.id,'code',v_room.code);
end $$;

create or replace function public.join_room(p_code text,p_name text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_room public.rooms; v_seat integer;
begin
  if auth.uid() is null then raise exception 'Sesi guest tidak valid.'; end if;
  if char_length(trim(p_name)) not between 1 and 20 then raise exception 'Nama harus 1 sampai 20 karakter.'; end if;
  select * into v_room from public.rooms where code=upper(trim(p_code)) for update;
  if not found then raise exception 'Ruang tidak ditemukan.'; end if;
  if exists(select 1 from public.room_players where room_id=v_room.id and user_id=auth.uid()) then
    update public.room_players set display_name=trim(p_name) where room_id=v_room.id and user_id=auth.uid(); return v_room.id;
  end if;
  if v_room.status<>'waiting' then raise exception 'Permainan sudah dimulai.'; end if;
  if (select count(*) from public.room_players where room_id=v_room.id)>=2 then raise exception 'Ruang sudah penuh.'; end if;
  select case when exists(select 1 from public.room_players where room_id=v_room.id and seat=1) then 2 else 1 end into v_seat;
  insert into public.room_players(room_id,user_id,seat,display_name,remaining_ms) values(v_room.id,auth.uid(),v_seat,trim(p_name),v_room.time_limit_ms);
  return v_room.id;
end $$;

create or replace function public.set_ready(p_room_id uuid,p_ready boolean)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_room public.rooms; v_players uuid[]; v_bag text[]; v_racks jsonb;
begin
  if not public.is_room_member(p_room_id) then raise exception 'Bukan anggota ruang.'; end if;
  select * into v_room from public.rooms where id=p_room_id for update;
  if v_room.status<>'waiting' then return false; end if;
  update public.room_players set ready=p_ready where room_id=p_room_id and user_id=auth.uid();
  if (select count(*) from public.room_players where room_id=p_room_id)=2 and not exists(select 1 from public.room_players where room_id=p_room_id and not ready) then
    select array_agg(user_id order by seat) into v_players from public.room_players where room_id=p_room_id;
    v_bag:=public.shuffled_bag();
    v_racks:=jsonb_build_object(v_players[1]::text,to_jsonb(v_bag[1:7]),v_players[2]::text,to_jsonb(v_bag[8:14]));
    insert into public.game_private(room_id,bag,racks) values(p_room_id,v_bag[15:array_length(v_bag,1)],v_racks)
      on conflict(room_id) do update set bag=excluded.bag,racks=excluded.racks;
    update public.rooms set status='playing',current_player_id=v_players[1],turn_started_at=now(),turn_no=1,board='{}',bag_count=array_length(v_bag,1)-14,updated_at=now() where id=p_room_id;
  end if;
  return true;
end $$;

create or replace function public.get_room_snapshot(p_room_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_result jsonb;
begin
  if not public.is_room_member(p_room_id) then raise exception 'Bukan anggota ruang.'; end if;
  select jsonb_build_object(
    'room',to_jsonb(r),
    'players',(select coalesce(jsonb_agg(to_jsonb(p) order by p.seat),'[]'::jsonb) from public.room_players p where p.room_id=r.id),
    'rack',coalesce((select gp.racks->auth.uid()::text from public.game_private gp where gp.room_id=r.id),'[]'::jsonb)
  ) into v_result from public.rooms r where r.id=p_room_id;
  return v_result;
end $$;

create or replace function public.finish_by_score(p_room_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_players uuid[]; v_racks jsonb; v_rack1 jsonb; v_rack2 jsonb; v_left1 integer:=0; v_left2 integer:=0; v_score1 integer; v_score2 integer; v_winner uuid;
begin
  select array_agg(user_id order by seat) into v_players from public.room_players where room_id=p_room_id;
  select racks into v_racks from public.game_private where room_id=p_room_id;
  v_rack1:=coalesce(v_racks->v_players[1]::text,'[]'::jsonb); v_rack2:=coalesce(v_racks->v_players[2]::text,'[]'::jsonb);
  select coalesce(sum(public.letter_score(value)),0) into v_left1 from jsonb_array_elements_text(v_rack1);
  select coalesce(sum(public.letter_score(value)),0) into v_left2 from jsonb_array_elements_text(v_rack2);
  update public.room_players set score=score-case when user_id=v_players[1] then v_left1 else v_left2 end where room_id=p_room_id;
  if p_reason='rack_empty' then
    if jsonb_array_length(v_rack1)=0 then update public.room_players set score=score+v_left2 where room_id=p_room_id and user_id=v_players[1]; end if;
    if jsonb_array_length(v_rack2)=0 then update public.room_players set score=score+v_left1 where room_id=p_room_id and user_id=v_players[2]; end if;
  end if;
  select score into v_score1 from public.room_players where room_id=p_room_id and user_id=v_players[1];
  select score into v_score2 from public.room_players where room_id=p_room_id and user_id=v_players[2];
  v_winner:=case when v_score1>v_score2 then v_players[1] when v_score2>v_score1 then v_players[2] else null end;
  update public.rooms set status='finished',winner_id=v_winner,end_reason=p_reason,current_player_id=null,turn_started_at=null,updated_at=now() where id=p_room_id;
  return v_winner;
end $$;

create or replace function public.play_move(p_room_id uuid,p_placements jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_room public.rooms; v_private public.game_private; v_player public.room_players; v_opponent uuid;
  v_rack jsonb; v_new_rack jsonb; v_new_board jsonb; v_element jsonb; v_letter text; v_position text;
  v_index integer; v_row integer; v_col integer; v_first_row integer; v_first_col integer;
  v_rows integer[]:='{}'; v_cols integer[]:='{}'; v_used integer[]:='{}'; v_new_keys text[]:='{}';
  v_same_row boolean; v_same_col boolean; v_horizontal boolean; v_connected boolean:=false;
  v_min integer; v_max integer; v_value integer; v_word text:=''; v_score integer:=0; v_word_multiplier integer:=1; v_premium text;
  v_cross_word text; v_cross_score integer; v_cross_multiplier integer; v_cross_length integer;
  v_start_row integer; v_start_col integer; v_step_row integer; v_step_col integer;
  v_elapsed integer; v_remaining integer; v_draw integer; v_bag text[];
begin
  if not public.is_room_member(p_room_id) then raise exception 'Bukan anggota ruang.'; end if;
  select * into v_room from public.rooms where id=p_room_id for update;
  if v_room.status<>'playing' then raise exception 'Permainan belum aktif.'; end if;
  if v_room.current_player_id<>auth.uid() then raise exception 'Sekarang bukan giliranmu.'; end if;
  if jsonb_typeof(p_placements)<>'array' or jsonb_array_length(p_placements) not between 1 and 7 then raise exception 'Jumlah keping tidak valid.'; end if;
  select * into v_player from public.room_players where room_id=p_room_id and user_id=auth.uid() for update;
  v_elapsed:=greatest(0,floor(extract(epoch from (now()-v_room.turn_started_at))*1000)::integer);
  v_remaining:=v_player.remaining_ms-v_elapsed;
  if v_remaining<=0 then
    select user_id into v_opponent from public.room_players where room_id=p_room_id and user_id<>auth.uid();
    update public.room_players set remaining_ms=0 where room_id=p_room_id and user_id=auth.uid();
    update public.rooms set status='finished',winner_id=v_opponent,end_reason='timeout',current_player_id=null,turn_started_at=null,updated_at=now() where id=p_room_id;
    insert into public.moves(room_id,turn_no,player_id,move_type) values(p_room_id,v_room.turn_no,auth.uid(),'timeout');
    return public.get_room_snapshot(p_room_id);
  end if;
  select * into v_private from public.game_private where room_id=p_room_id for update;
  v_rack:=coalesce(v_private.racks->auth.uid()::text,'[]'::jsonb); v_new_board:=v_room.board;
  for v_element in select value from jsonb_array_elements(p_placements) loop
    v_row:=(v_element->>'row')::integer; v_col:=(v_element->>'col')::integer; v_index:=(v_element->>'rack_index')::integer;
    if v_row not between 0 and 14 or v_col not between 0 and 14 then raise exception 'Posisi di luar papan.'; end if;
    if v_index<0 or v_index>=jsonb_array_length(v_rack) or v_index=any(v_used) then raise exception 'Keping rak tidak valid.'; end if;
    v_position:=v_row||'-'||v_col;
    if v_room.board ? v_position or v_position=any(v_new_keys) then raise exception 'Kotak sudah terisi.'; end if;
    v_letter:=v_rack->>v_index;
    v_rows:=array_append(v_rows,v_row); v_cols:=array_append(v_cols,v_col); v_used:=array_append(v_used,v_index); v_new_keys:=array_append(v_new_keys,v_position);
    v_new_board:=jsonb_set(v_new_board,array[v_position],to_jsonb(v_letter),true);
  end loop;
  select count(distinct value)=1 into v_same_row from unnest(v_rows) value;
  select count(distinct value)=1 into v_same_col from unnest(v_cols) value;
  if not v_same_row and not v_same_col then raise exception 'Semua huruf harus satu baris atau kolom.'; end if;
  v_first_row:=v_rows[1]; v_first_col:=v_cols[1];
  if cardinality(v_rows)=1 then
    v_horizontal:=not (v_room.board ? ((v_first_row-1)||'-'||v_first_col) or v_room.board ? ((v_first_row+1)||'-'||v_first_col));
  else v_horizontal:=v_same_row; end if;
  if v_room.board='{}'::jsonb then
    if not ('7-7'=any(v_new_keys)) then raise exception 'Kata pertama harus melewati kotak tengah.'; end if;
  else
    for v_value in 1..cardinality(v_rows) loop
      v_row:=v_rows[v_value]; v_col:=v_cols[v_value];
      if v_room.board ? ((v_row-1)||'-'||v_col) or v_room.board ? ((v_row+1)||'-'||v_col) or v_room.board ? (v_row||'-'||(v_col-1)) or v_room.board ? (v_row||'-'||(v_col+1)) then v_connected:=true; end if;
    end loop;
    if not v_connected then raise exception 'Kata harus tersambung dengan papan.'; end if;
  end if;
  if v_horizontal then select min(value),max(value) into v_min,v_max from unnest(v_cols) value; else select min(value),max(value) into v_min,v_max from unnest(v_rows) value; end if;
  for v_value in v_min..v_max loop
    v_position:=case when v_horizontal then v_first_row||'-'||v_value else v_value||'-'||v_first_col end;
    if not (v_new_board ? v_position) then raise exception 'Tidak boleh ada kotak kosong di tengah kata.'; end if;
  end loop;
  v_step_row:=case when v_horizontal then 0 else 1 end; v_step_col:=case when v_horizontal then 1 else 0 end;
  v_start_row:=v_first_row; v_start_col:=v_first_col;
  while v_new_board ? ((v_start_row-v_step_row)||'-'||(v_start_col-v_step_col)) loop v_start_row:=v_start_row-v_step_row; v_start_col:=v_start_col-v_step_col; end loop;
  v_row:=v_start_row; v_col:=v_start_col;
  while v_new_board ? (v_row||'-'||v_col) loop
    v_position:=v_row||'-'||v_col; v_letter:=v_new_board->>v_position; v_word:=v_word||v_letter;
    if v_position=any(v_new_keys) then
      v_premium:=public.premium_at(v_row,v_col);
      v_score:=v_score+public.letter_score(v_letter)*case when v_premium='double-letter' then 2 when v_premium='triple-letter' then 3 else 1 end;
      if v_premium='double-word' then v_word_multiplier:=v_word_multiplier*2; elsif v_premium='triple-word' then v_word_multiplier:=v_word_multiplier*3; end if;
    else v_score:=v_score+public.letter_score(v_letter); end if;
    v_row:=v_row+v_step_row; v_col:=v_col+v_step_col;
  end loop;
  if not public.is_valid_word(v_word) then raise exception 'Kata tidak ada di kamus: %',upper(v_word); end if;
  v_score:=v_score*v_word_multiplier;
  for v_value in 1..cardinality(v_rows) loop
    v_row:=v_rows[v_value]; v_col:=v_cols[v_value];
    v_step_row:=case when v_horizontal then 1 else 0 end; v_step_col:=case when v_horizontal then 0 else 1 end;
    v_start_row:=v_row; v_start_col:=v_col;
    while v_new_board ? ((v_start_row-v_step_row)||'-'||(v_start_col-v_step_col)) loop v_start_row:=v_start_row-v_step_row; v_start_col:=v_start_col-v_step_col; end loop;
    v_cross_word:=''; v_cross_score:=0; v_cross_multiplier:=1; v_cross_length:=0; v_row:=v_start_row; v_col:=v_start_col;
    while v_new_board ? (v_row||'-'||v_col) loop
      v_position:=v_row||'-'||v_col; v_letter:=v_new_board->>v_position; v_cross_word:=v_cross_word||v_letter; v_cross_length:=v_cross_length+1;
      if v_position=any(v_new_keys) then
        v_premium:=public.premium_at(v_row,v_col);
        v_cross_score:=v_cross_score+public.letter_score(v_letter)*case when v_premium='double-letter' then 2 when v_premium='triple-letter' then 3 else 1 end;
        if v_premium='double-word' then v_cross_multiplier:=v_cross_multiplier*2; elsif v_premium='triple-word' then v_cross_multiplier:=v_cross_multiplier*3; end if;
      else v_cross_score:=v_cross_score+public.letter_score(v_letter); end if;
      v_row:=v_row+v_step_row; v_col:=v_col+v_step_col;
    end loop;
    if v_cross_length>1 then
      if not public.is_valid_word(v_cross_word) then raise exception 'Kata silang tidak ada di kamus: %',upper(v_cross_word); end if;
      v_score:=v_score+(v_cross_score*v_cross_multiplier);
    end if;
  end loop;
  if cardinality(v_used)=7 then v_score:=v_score+50; end if;
  select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into v_new_rack from jsonb_array_elements(v_rack) with ordinality as item(value,ord) where not ((ord-1)::integer=any(v_used));
  v_bag:=v_private.bag; v_draw:=least(7-jsonb_array_length(v_new_rack),coalesce(cardinality(v_bag),0));
  if v_draw>0 then
    for v_value in 1..v_draw loop v_new_rack:=v_new_rack||jsonb_build_array(v_bag[v_value]); end loop;
    v_bag:=case when v_draw<cardinality(v_bag) then v_bag[(v_draw+1):cardinality(v_bag)] else '{}'::text[] end;
  end if;
  update public.game_private set bag=v_bag,racks=jsonb_set(racks,array[auth.uid()::text],v_new_rack,true) where room_id=p_room_id;
  update public.room_players set score=score+v_score,remaining_ms=v_remaining where room_id=p_room_id and user_id=auth.uid();
  insert into public.moves(room_id,turn_no,player_id,move_type,word,score,placements) values(p_room_id,v_room.turn_no,auth.uid(),'word',v_word,v_score,p_placements);
  if cardinality(v_bag)=0 and jsonb_array_length(v_new_rack)=0 then
    update public.rooms set board=v_new_board,bag_count=0,updated_at=now() where id=p_room_id; perform public.finish_by_score(p_room_id,'rack_empty');
  else
    select user_id into v_opponent from public.room_players where room_id=p_room_id and user_id<>auth.uid();
    update public.rooms set board=v_new_board,bag_count=coalesce(cardinality(v_bag),0),current_player_id=v_opponent,turn_started_at=now(),turn_no=turn_no+1,consecutive_scoreless=0,updated_at=now() where id=p_room_id;
  end if;
  return public.get_room_snapshot(p_room_id);
end $$;

create or replace function public.pass_turn(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_room public.rooms; v_player public.room_players; v_opponent uuid; v_elapsed integer; v_remaining integer;
begin
  if not public.is_room_member(p_room_id) then raise exception 'Bukan anggota ruang.'; end if;
  select * into v_room from public.rooms where id=p_room_id for update;
  if v_room.status<>'playing' or v_room.current_player_id<>auth.uid() then raise exception 'Sekarang bukan giliranmu.'; end if;
  select * into v_player from public.room_players where room_id=p_room_id and user_id=auth.uid() for update;
  v_elapsed:=greatest(0,floor(extract(epoch from (now()-v_room.turn_started_at))*1000)::integer); v_remaining:=v_player.remaining_ms-v_elapsed;
  select user_id into v_opponent from public.room_players where room_id=p_room_id and user_id<>auth.uid();
  update public.room_players set remaining_ms=greatest(0,v_remaining) where room_id=p_room_id and user_id=auth.uid();
  insert into public.moves(room_id,turn_no,player_id,move_type) values(p_room_id,v_room.turn_no,auth.uid(),case when v_remaining<=0 then 'timeout' else 'pass' end);
  if v_remaining<=0 then update public.rooms set status='finished',winner_id=v_opponent,end_reason='timeout',current_player_id=null,turn_started_at=null,updated_at=now() where id=p_room_id;
  elsif v_room.consecutive_scoreless+1>=4 then update public.rooms set consecutive_scoreless=4,updated_at=now() where id=p_room_id; perform public.finish_by_score(p_room_id,'scoreless');
  else update public.rooms set current_player_id=v_opponent,turn_started_at=now(),turn_no=turn_no+1,consecutive_scoreless=consecutive_scoreless+1,updated_at=now() where id=p_room_id; end if;
  return public.get_room_snapshot(p_room_id);
end $$;

create or replace function public.resign_game(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_room public.rooms; v_opponent uuid;
begin
  if not public.is_room_member(p_room_id) then raise exception 'Bukan anggota ruang.'; end if;
  select * into v_room from public.rooms where id=p_room_id for update;
  if v_room.status<>'playing' then raise exception 'Permainan tidak aktif.'; end if;
  select user_id into v_opponent from public.room_players where room_id=p_room_id and user_id<>auth.uid();
  update public.rooms set status='finished',winner_id=v_opponent,end_reason='resign',current_player_id=null,turn_started_at=null,updated_at=now() where id=p_room_id;
  insert into public.moves(room_id,turn_no,player_id,move_type) values(p_room_id,v_room.turn_no,auth.uid(),'resign');
  return public.get_room_snapshot(p_room_id);
end $$;

create or replace function public.claim_timeout(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_room public.rooms; v_current public.room_players; v_winner uuid; v_elapsed integer;
begin
  if not public.is_room_member(p_room_id) then raise exception 'Bukan anggota ruang.'; end if;
  select * into v_room from public.rooms where id=p_room_id for update;
  if v_room.status<>'playing' then return public.get_room_snapshot(p_room_id); end if;
  select * into v_current from public.room_players where room_id=p_room_id and user_id=v_room.current_player_id for update;
  v_elapsed:=greatest(0,floor(extract(epoch from (now()-v_room.turn_started_at))*1000)::integer);
  if v_elapsed<v_current.remaining_ms then raise exception 'Waktu pemain belum habis.'; end if;
  select user_id into v_winner from public.room_players where room_id=p_room_id and user_id<>v_room.current_player_id;
  update public.room_players set remaining_ms=0 where room_id=p_room_id and user_id=v_room.current_player_id;
  update public.rooms set status='finished',winner_id=v_winner,end_reason='timeout',current_player_id=null,turn_started_at=null,updated_at=now() where id=p_room_id;
  insert into public.moves(room_id,turn_no,player_id,move_type) values(p_room_id,v_room.turn_no,v_room.current_player_id,'timeout');
  return public.get_room_snapshot(p_room_id);
end $$;

revoke all on public.rooms,public.room_players,public.game_private,public.moves,public.valid_words from anon,authenticated;
revoke all on function public.is_valid_word(text) from public,anon,authenticated;
grant select on public.rooms,public.room_players,public.moves to authenticated;
grant execute on function public.is_room_member(uuid),public.create_room(text,integer),public.join_room(text,text),public.set_ready(uuid,boolean),public.get_room_snapshot(uuid),public.play_move(uuid,jsonb),public.pass_turn(uuid),public.resign_game(uuid),public.claim_timeout(uuid) to authenticated;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='rooms') then alter publication supabase_realtime add table public.rooms; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='room_players') then alter publication supabase_realtime add table public.room_players; end if;
end $$;
