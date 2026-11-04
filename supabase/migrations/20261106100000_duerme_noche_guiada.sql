-- Punto Duerme · noche guiada por el narrador (como en el juego clásico).
-- De noche todos cierran los ojos y solo actúa quien el narrador llama:
--   anochece (narrada: «cae la noche… todos cierran los ojos») → noche (turno de los Puntos: eligen víctima y confirman,
--   o se acaba el tiempo) → noche_cierra (narrada: «los Puntos vuelven a dormir») → amanece.
-- Los Ciegos no hacen nada de noche (se ignoran sus marcas y confirmaciones).
-- La víctima se calcula al acabar el turno de los Puntos pero NO muere (ni se publica) hasta que amanece: así nadie ve antes de
-- tiempo quién ha caído. Fase 2: cada personaje tendrá su turno igual (con su «despierta» y «vuelve a dormir», y con la misma duración
-- aunque esté muerto): se añaden como fases noche_<papel> / noche_<papel>_cierra entre noche y noche_cierra.

alter table public.duerme_salas add column pendiente jsonb;

create or replace function public._duerme_noche_fin(p_codigo text) returns void
language plpgsql security definer set search_path = public as $$
declare s duerme_salas; v text; n1 int; n2 int;
begin
  select * into s from duerme_salas where codigo = p_codigo;
  select objetivo, n into v, n1 from (
    select a.objetivo, count(*) n from duerme_acciones a
      join duerme_jugadores j on j.codigo = a.codigo and j.id = a.id
     where a.codigo = p_codigo and a.ronda = s.ronda and a.fase = 'noche' and a.tipo = 'marca'
       and j.rol = 'punto' and j.vivo
     group by a.objetivo order by n desc limit 1) t;
  select n into n2 from (
    select count(*) n from duerme_acciones a
      join duerme_jugadores j on j.codigo = a.codigo and j.id = a.id
     where a.codigo = p_codigo and a.ronda = s.ronda and a.fase = 'noche' and a.tipo = 'marca'
       and j.rol = 'punto' and j.vivo
     group by a.objetivo order by n desc offset 1 limit 1) t;
  -- victima única (si hay empate entre los Puntos, no muere nadie); se aplica al amanecer
  update duerme_salas set pendiente = jsonb_build_object('victima', case when v is not null and (n2 is null or n2 < n1) then v end),
                          publico = '{}' where codigo = p_codigo;
  perform _duerme_fase(p_codigo, 'noche_cierra', 40);
end $$;

create or replace function public._duerme_amanece(p_codigo text) returns void
language plpgsql security definer set search_path = public as $$
declare s duerme_salas; r duerme_jugadores; muertos jsonb := '[]';
begin
  select * into s from duerme_salas where codigo = p_codigo;
  if s.pendiente->>'victima' is not null then
    update duerme_jugadores set vivo = false where codigo = p_codigo and id = s.pendiente->>'victima' and vivo and juega returning * into r;
    if found then
      muertos := jsonb_build_array(jsonb_build_object('id', r.id, 'rol', case when (s.config->>'revelar')::boolean then r.rol end));
    end if;
  end if;
  update duerme_salas set publico = jsonb_build_object('muertos', muertos), pendiente = null where codigo = p_codigo;
  perform _duerme_fase(p_codigo, 'amanece', 40);
end $$;

create or replace function public.duerme_avanzar(p_codigo text, p_token text, p_fase text) returns void
language plpgsql security definer set search_path = public as $$
declare r duerme_jugadores := _duerme_yo(p_codigo, p_token); s duerme_salas; g text;
begin
  select * into s from duerme_salas where codigo = r.codigo for update;
  if s.fase <> p_fase then return; end if;
  if not ((s.fase_hasta is not null and now() >= s.fase_hasta - interval '300 milliseconds')
          or (r.id = s.narrador and s.fase in ('anochece', 'noche_cierra', 'amanece', 'resultado'))) then
    return;
  end if;
  if s.fase = 'reparto' then perform _duerme_anochece(s.codigo);
  elsif s.fase = 'anochece' then perform _duerme_fase(s.codigo, 'noche', (s.config->>'t_noche')::int);
  elsif s.fase = 'noche' then perform _duerme_noche_fin(s.codigo);
  elsif s.fase = 'noche_cierra' then perform _duerme_amanece(s.codigo);
  elsif s.fase = 'amanece' then
    g := _duerme_ganador(s.codigo);
    if g is not null then perform _duerme_final(s.codigo, g);
    else perform _duerme_fase(s.codigo, 'debate', (s.config->>'t_debate')::int); end if;
  elsif s.fase = 'debate' then perform _duerme_fase(s.codigo, 'votacion', (s.config->>'t_voto')::int);
  elsif s.fase = 'votacion' then perform _duerme_voto_fin(s.codigo);
  elsif s.fase = 'resultado' then
    g := _duerme_ganador(s.codigo);
    if g is not null then perform _duerme_final(s.codigo, g); else perform _duerme_anochece(s.codigo); end if;
  end if;
end $$;

-- Los Ciegos no actúan de noche: se ignoran sus marcas y confirmaciones
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

  elsif p_tipo = 'voto' then
    if s.fase <> 'votacion' then return; end if;
    select * into o from duerme_jugadores where codigo = s.codigo and id = p_objetivo and juega and vivo;
    if not found or o.id = r.id then return; end if;
    insert into duerme_acciones (codigo, ronda, fase, id, tipo, objetivo) values (s.codigo, s.ronda, 'votacion', r.id, 'voto', o.id)
      on conflict (codigo, ronda, fase, id, tipo) do update set objetivo = excluded.objetivo, creada = now();
    select count(*) into faltan from duerme_jugadores j
     where j.codigo = s.codigo and j.juega and j.vivo
       and not exists (select 1 from duerme_acciones a where a.codigo = s.codigo and a.ronda = s.ronda
                        and a.fase = 'votacion' and a.tipo = 'voto' and a.id = j.id);
    if faltan = 0 then perform _duerme_voto_fin(s.codigo); else perform _duerme_ping(s.codigo); end if;
  end if;
end $$;

-- Bots: los Ciegos no hacen nada de noche; los Puntos igual que antes
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
    t := _duerme_bot_azar(p_codigo, p_id, false, fv);
    if t is not null then perform _duerme_actuar_id(p_codigo, p_id, 'voto', t); end if;
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
