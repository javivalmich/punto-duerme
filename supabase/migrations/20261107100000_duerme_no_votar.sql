-- Opción «No votar»: abstenerse cuenta como haber votado pero no suma a nadie.
-- Acción 'abstiene' (se guarda como voto sin objetivo). Los bots a veces se abstienen; forzar_voto '-' = no votan.

create or replace function public._duerme_voto_fin(p_codigo text) returns void
language plpgsql security definer set search_path = public as $$
declare s duerme_salas; rec jsonb; v text; n1 int; n2 int; r duerme_jugadores; elim jsonb := null; abst int;
begin
  select * into s from duerme_salas where codigo = p_codigo;
  select coalesce(jsonb_agg(jsonb_build_object('id', objetivo, 'n', n) order by n desc), '[]') into rec from (
    select a.objetivo, count(*) n from duerme_acciones a
      join duerme_jugadores j on j.codigo = a.codigo and j.id = a.id and j.vivo and j.juega
      join duerme_jugadores o on o.codigo = a.codigo and o.id = a.objetivo and o.vivo and o.juega
     where a.codigo = p_codigo and a.ronda = s.ronda and a.fase = 'votacion' and a.tipo = 'voto'
     group by a.objetivo) t;
  select count(*) into abst from duerme_acciones a
    join duerme_jugadores j on j.codigo = a.codigo and j.id = a.id and j.vivo and j.juega
   where a.codigo = p_codigo and a.ronda = s.ronda and a.fase = 'votacion' and a.tipo = 'voto' and a.objetivo is null;
  v := rec->0->>'id'; n1 := (rec->0->>'n')::int; n2 := (rec->1->>'n')::int;
  if v is not null and (n2 is null or n2 < n1) then
    update duerme_jugadores set vivo = false where codigo = p_codigo and id = v returning * into r;
    elim := jsonb_build_object('id', r.id, 'rol', case when (s.config->>'revelar')::boolean then r.rol end);
  end if;
  update duerme_salas set publico = jsonb_build_object('eliminado', elim, 'recuento', rec, 'abstenciones', abst) where codigo = p_codigo;
  perform _duerme_fase(p_codigo, 'resultado', 40);
end $$;

create or replace function public._duerme_actuar_id(p_codigo text, p_id text, p_tipo text, p_objetivo text) returns void
language plpgsql security definer set search_path = public as $$
declare r duerme_jugadores; s duerme_salas; o duerme_jugadores;
        vivos_p int; marcados int; distintos int; mio text; faltan int;
begin
  select * into s from duerme_salas where codigo = p_codigo for update;
  select * into r from duerme_jugadores where codigo = p_codigo and id = p_id;
  if not found then return; end if;
  if p_tipo = 'votar_ya' then
    if s.fase = 'debate' and r.id in (s.anfitrion, s.narrador) then
      perform _duerme_fase(s.codigo, 'votacion', (s.config->>'t_voto')::int);
    end if;
    return;
  end if;
  if not (r.juega and r.vivo) then return; end if;

  if p_tipo = 'listo' then
    if s.fase <> 'reparto' then return; end if;
    update duerme_jugadores set listo = true where codigo = s.codigo and id = r.id;
    if not exists (select 1 from duerme_jugadores where codigo = s.codigo and juega and vivo and not listo and not fuera) then
      perform _duerme_anochece(s.codigo);
    else
      perform _duerme_ping(s.codigo);
    end if;

  elsif p_tipo = 'marca' then
    if s.fase <> 'noche' or r.rol <> 'punto' then return; end if;
    select * into o from duerme_jugadores where codigo = s.codigo and id = p_objetivo and juega and vivo;
    if not found or o.id = r.id or o.rol = 'punto' then return; end if;
    insert into duerme_acciones (codigo, ronda, fase, id, tipo, objetivo) values (s.codigo, s.ronda, 'noche', r.id, 'marca', o.id)
      on conflict (codigo, ronda, fase, id, tipo) do update set objetivo = excluded.objetivo, creada = now();
    perform _duerme_ping(s.codigo);

  elsif p_tipo = 'confirma' then
    if s.fase <> 'noche' or r.rol <> 'punto' then return; end if;
    select objetivo into mio from duerme_acciones where codigo = s.codigo and ronda = s.ronda and fase = 'noche' and id = r.id and tipo = 'marca';
    if mio is null then return; end if;
    insert into duerme_acciones (codigo, ronda, fase, id, tipo) values (s.codigo, s.ronda, 'noche', r.id, 'confirma')
      on conflict do nothing;
    -- un solo Punto vivo confirma directamente; si hay varios, todos tienen que haber marcado al mismo
    select count(*) into vivos_p from duerme_jugadores where codigo = s.codigo and rol = 'punto' and vivo;
    select count(*), count(distinct a.objetivo) into marcados, distintos from duerme_acciones a
      join duerme_jugadores j on j.codigo = a.codigo and j.id = a.id and j.rol = 'punto' and j.vivo
     where a.codigo = s.codigo and a.ronda = s.ronda and a.fase = 'noche' and a.tipo = 'marca';
    if marcados = vivos_p and distintos = 1 then
      perform _duerme_noche_fin(s.codigo);
    else
      perform _duerme_ping(s.codigo);
    end if;

  elsif p_tipo in ('voto', 'abstiene') then
    if s.fase <> 'votacion' then return; end if;
    if p_tipo = 'abstiene' then
      -- «No votar»: cuenta como haber votado, pero sin objetivo (no suma a nadie)
      insert into duerme_acciones (codigo, ronda, fase, id, tipo, objetivo) values (s.codigo, s.ronda, 'votacion', r.id, 'voto', null)
        on conflict (codigo, ronda, fase, id, tipo) do update set objetivo = null, creada = now();
    else
      select * into o from duerme_jugadores where codigo = s.codigo and id = p_objetivo and juega and vivo;
      if not found or o.id = r.id then return; end if;
      insert into duerme_acciones (codigo, ronda, fase, id, tipo, objetivo) values (s.codigo, s.ronda, 'votacion', r.id, 'voto', o.id)
        on conflict (codigo, ronda, fase, id, tipo) do update set objetivo = excluded.objetivo, creada = now();
    end if;
    select count(*) into faltan from duerme_jugadores j
     where j.codigo = s.codigo and j.juega and j.vivo
       and not exists (select 1 from duerme_acciones a where a.codigo = s.codigo and a.ronda = s.ronda
                        and a.fase = 'votacion' and a.tipo = 'voto' and a.id = j.id);
    if faltan = 0 then perform _duerme_voto_fin(s.codigo); else perform _duerme_ping(s.codigo); end if;
  end if;
end $$;

create or replace function public._duerme_bot_paso(p_codigo text, p_id text) returns void
language plpgsql security definer set search_path = public as $$
declare s duerme_salas; b duerme_jugadores; fm text; fv text; t text; seg numeric;
begin
  select * into s from duerme_salas where codigo = p_codigo;
  select * into b from duerme_jugadores where codigo = p_codigo and id = p_id;
  fm := s.pruebas->>'forzar_marca'; fv := s.pruebas->>'forzar_voto';
  seg := 1.5 + random() * 3.5;

  if s.fase = 'reparto' then
    perform _duerme_actuar_id(p_codigo, p_id, 'listo', null);
    update duerme_jugadores set bot_at = null where codigo = p_codigo and id = p_id;

  elsif s.fase = 'noche' then
    -- (fase 2: aquí van los turnos de Cupido, Vidente y Bruja según b.rol)
    if b.rol = 'punto' then
      if b.bot_paso = 0 then
        t := _duerme_bot_objetivo_punto(p_codigo, p_id, fm);
        if t is not null then perform _duerme_actuar_id(p_codigo, p_id, 'marca', t); end if;
        update duerme_jugadores set bot_paso = 1, bot_at = now() + seg * interval '1 second' where codigo = p_codigo and id = p_id;
      else
        t := _duerme_bot_objetivo_punto(p_codigo, p_id, fm);
        if t is not null then perform _duerme_actuar_id(p_codigo, p_id, 'marca', t); end if;
        perform _duerme_actuar_id(p_codigo, p_id, 'confirma', null);
        update duerme_jugadores set bot_at = null where codigo = p_codigo and id = p_id;
      end if;
    else
      update duerme_jugadores set bot_at = null where codigo = p_codigo and id = p_id; -- duerme
    end if;

  elsif s.fase = 'votacion' then
    -- forzar_voto '-' = «los bots no votan»; si no, a veces (8 %) se abstienen
    if fv = '-' or random() < 0.08 then
      perform _duerme_actuar_id(p_codigo, p_id, 'abstiene', null);
    else
      t := _duerme_bot_azar(p_codigo, p_id, false, fv);
      if t is not null then perform _duerme_actuar_id(p_codigo, p_id, 'voto', t); end if;
    end if;
    update duerme_jugadores set bot_at = null where codigo = p_codigo and id = p_id;
  end if;
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like '%duerme%' loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    if f.proname like 'duerme\_%' then
      execute format('grant execute on function %s to anon, authenticated', f.sig);
    end if;
  end loop;
end $$;
