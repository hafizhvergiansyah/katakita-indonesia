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
