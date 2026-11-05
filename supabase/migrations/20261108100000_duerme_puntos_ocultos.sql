-- Los Puntos no ven quiénes son sus compañeros: ni la tarjeta, ni la lista de jugadores, ni las marcas (solo el recuento por víctima).
-- Se puede marcar a cualquiera menos a uno mismo; si los Puntos eligen a un compañero, muere.

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
    -- los Puntos no saben quiénes son sus compañeros: se puede marcar a cualquiera menos a uno mismo (rechazar a un compañero lo delataría)
    if not found or o.id = r.id then return; end if;
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

create or replace function public.duerme_vista(p_codigo text, p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r duerme_jugadores := _duerme_yo(p_codigo, p_token); s duerme_salas; punto boolean; fin boolean; ver boolean;
begin
  select * into s from duerme_salas where codigo = r.codigo;
  punto := r.rol = 'punto' and s.fase <> 'sala';
  fin := s.fase = 'final';
  ver := s.anfitrion = r.id and coalesce((s.pruebas->>'ver_roles')::boolean, false) and _duerme_pruebas();
  return jsonb_build_object(
    'ahora', floor(extract(epoch from clock_timestamp()) * 1000),
    'sala', jsonb_build_object(
      'codigo', s.codigo, 'fase', s.fase, 'ronda', s.ronda, 'version', s.version, 'config', s.config,
      'desde', floor(extract(epoch from s.fase_desde) * 1000),
      'hasta', case when s.fase_hasta is not null then floor(extract(epoch from s.fase_hasta) * 1000) end,
      'anfitrion', s.anfitrion, 'narrador', s.narrador, 'publico', s.publico,
      'bots', s.pruebas is not null and exists (select 1 from duerme_jugadores where codigo = s.codigo and bot),
      'pruebas', case when s.anfitrion = r.id and _duerme_pruebas() then coalesce(s.pruebas, '{"ver_roles":false,"forzar_marca":null,"forzar_voto":null}') || '{"permitido":true}' end),
    'jugadores', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', j.id, 'nombre', j.nombre, 'look', j.look, 'orden', j.orden, 'juega', j.juega,
        'vivo', j.vivo, 'fuera', j.fuera, 'listo', j.listo, 'bot', j.bot,
        'rol', case when fin or j.id = r.id or (ver and j.bot) then j.rol end) order by j.orden), '[]')
      from duerme_jugadores j where j.codigo = s.codigo),
    'yo', jsonb_build_object('id', r.id, 'rol', r.rol, 'vivo', r.vivo, 'juega', r.juega),
    -- solo el recuento por víctima, nunca quién ha marcado a quién (los Puntos no se conocen entre sí)
    'marcas', case when punto and s.fase = 'noche' then (
        select coalesce(jsonb_object_agg(t.objetivo, t.n), '{}') from (
          select a.objetivo, count(*) n from duerme_acciones a
            join duerme_jugadores j on j.codigo = a.codigo and j.id = a.id and j.rol = 'punto' and j.vivo
           where a.codigo = s.codigo and a.ronda = s.ronda and a.fase = 'noche' and a.tipo = 'marca'
           group by a.objetivo) t) end,
    'puntos_vivos', case when punto and s.fase = 'noche' then (
        select count(*) from duerme_jugadores where codigo = s.codigo and rol = 'punto' and vivo) end,
    'mio', (select coalesce(jsonb_object_agg(a.tipo, coalesce(a.objetivo, '')), '{}') from duerme_acciones a
             where a.codigo = s.codigo and a.ronda = s.ronda and a.fase = s.fase and a.id = r.id),
    'votos', case when s.fase = 'votacion' then (
        select count(*) from duerme_acciones a join duerme_jugadores j on j.codigo = a.codigo and j.id = a.id and j.vivo
         where a.codigo = s.codigo and a.ronda = s.ronda and a.fase = 'votacion' and a.tipo = 'voto') end);
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
