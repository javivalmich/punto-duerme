-- Punto Duerme · bots de prueba (solo para probar con un único móvil).
-- Los bots son jugadores falsos que mueve el SERVIDOR: duerme_tick(...) los hace actuar con un retraso aleatorio.
-- Todo está protegido por el interruptor global duerme_flags('pruebas'): para cerrar los bots antes de lanzar el juego:
--     update duerme_flags set valor = false where clave = 'pruebas';
-- Seguridad: los bots nunca dan acceso a los papeles de jugadores reales. Con «ver roles de los bots» activado, solo el
-- anfitrión de esa sala recibe el papel de los jugadores que son bots (nunca el de personas).

create table public.duerme_flags (clave text primary key, valor boolean not null);
alter table public.duerme_flags enable row level security;
revoke all on public.duerme_flags from anon, authenticated;
insert into public.duerme_flags values ('pruebas', true);

alter table public.duerme_salas add column pruebas jsonb; -- null = la sala no usa bots; {ver_roles, forzar_marca, forzar_voto}
alter table public.duerme_jugadores
  add column bot boolean not null default false,
  add column bot_clave text,          -- «ronda:fase» para la que el bot tiene programada su acción
  add column bot_paso int not null default 0,
  add column bot_at timestamptz;      -- cuándo le toca actuar

create or replace function public._duerme_pruebas() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select valor from duerme_flags where clave = 'pruebas'), false)
$$;

-- ---------- Acción de un jugador por id (la usan duerme_actuar y los bots) ----------
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
    if s.fase <> 'noche' then return; end if;
    select * into o from duerme_jugadores where codigo = s.codigo and id = p_objetivo and juega and vivo;
    if not found or o.id = r.id then return; end if;
    if r.rol = 'punto' and o.rol = 'punto' then return; end if;
    insert into duerme_acciones (codigo, ronda, fase, id, tipo, objetivo) values (s.codigo, s.ronda, 'noche', r.id, 'marca', o.id)
      on conflict (codigo, ronda, fase, id, tipo) do update set objetivo = excluded.objetivo, creada = now();
    perform _duerme_ping(s.codigo);

  elsif p_tipo = 'confirma' then
    if s.fase <> 'noche' then return; end if;
    insert into duerme_acciones (codigo, ronda, fase, id, tipo) values (s.codigo, s.ronda, 'noche', r.id, 'confirma')
      on conflict do nothing;
    if r.rol <> 'punto' then perform _duerme_ping(s.codigo); return; end if; -- los Ciegos también confirman (solo de tapadera)
    select objetivo into mio from duerme_acciones where codigo = s.codigo and ronda = s.ronda and fase = 'noche' and id = r.id and tipo = 'marca';
    if mio is null then return; end if;
    -- un solo Punto vivo confirma directamente; si hay varios, todos tienen que haber marcado al mismo
    select count(*) into vivos_p from duerme_jugadores where codigo = s.codigo and rol = 'punto' and vivo;
    select count(*), count(distinct a.objetivo) into marcados, distintos from duerme_acciones a
      join duerme_jugadores j on j.codigo = a.codigo and j.id = a.id and j.rol = 'punto' and j.vivo
     where a.codigo = s.codigo and a.ronda = s.ronda and a.fase = 'noche' and a.tipo = 'marca';
    if marcados = vivos_p and distintos = 1 then
      perform _duerme_noche_fin(s.codigo);
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

create or replace function public.duerme_actuar(p_codigo text, p_token text, p_tipo text, p_objetivo text) returns void
language plpgsql security definer set search_path = public as $$
declare r duerme_jugadores := _duerme_yo(p_codigo, p_token);
begin
  perform _duerme_actuar_id(r.codigo, r.id, p_tipo, p_objetivo);
end $$;

-- ---------- Quién pasa a ser anfitrión/narrador: nunca un bot. Si solo quedan bots, se borra la sala ----------
create or replace function public._duerme_quita(p_codigo text, p_id text) returns void
language plpgsql security definer set search_path = public as $$
declare s duerme_salas; sig text; g text;
begin
  select * into s from duerme_salas where codigo = p_codigo;
  if s.fase in ('sala', 'final') then
    delete from duerme_jugadores where codigo = p_codigo and id = p_id;
  else
    update duerme_jugadores set fuera = true, vivo = false where codigo = p_codigo and id = p_id;
  end if;
  select id into sig from duerme_jugadores where codigo = p_codigo and not fuera and not bot order by orden limit 1;
  if sig is null then delete from duerme_salas where codigo = p_codigo; return; end if;
  update duerme_salas
     set anfitrion = case when anfitrion = p_id then sig else anfitrion end,
         narrador  = case when narrador = p_id then (case when anfitrion = p_id then sig else anfitrion end) else narrador end
   where codigo = p_codigo;
  if s.fase not in ('sala', 'final', 'reparto') then
    g := _duerme_ganador(p_codigo);
    if g is not null then perform _duerme_final(p_codigo, g); return; end if;
  end if;
  perform _duerme_ping(p_codigo);
end $$;

-- ---------- Añadir bots y panel de pruebas (solo el anfitrión, en la sala de espera, con el interruptor global) ----------
create or replace function public.duerme_bot_add(p_codigo text, p_token text) returns void
language plpgsql security definer set search_path = public as $$
declare r duerme_jugadores := _duerme_yo(p_codigo, p_token); s duerme_salas; nom text; n int;
        nombres text[] := array['Ana','Luis','Marta','Pablo','Eva','Hugo','Lucía','Iván','Sara','Dani','Nora','Raúl','Inés','Leo','Cris','Omar'];
begin
  if not _duerme_pruebas() then raise exception 'sin_pruebas'; end if;
  select * into s from duerme_salas where codigo = r.codigo for update;
  if s.anfitrion <> r.id then raise exception 'solo_anfitrion'; end if;
  if s.fase <> 'sala' then raise exception 'empezada'; end if;
  select count(*) into n from duerme_jugadores where codigo = s.codigo;
  if n >= 20 then raise exception 'llena'; end if;
  select 'Bot ' || x into nom from unnest(nombres) x
   where not exists (select 1 from duerme_jugadores j where j.codigo = s.codigo and j.nombre = 'Bot ' || x) limit 1;
  if nom is null then nom := 'Bot ' || (n + 1); end if;
  insert into duerme_jugadores (codigo, id, token, nombre, look, orden, bot)
       values (s.codigo, left(md5(gen_random_uuid()::text), 8), gen_random_uuid()::text, nom, null,
               (select coalesce(max(orden), 0) + 1 from duerme_jugadores where codigo = s.codigo), true);
  update duerme_salas set pruebas = coalesce(pruebas, '{"ver_roles":false,"forzar_marca":null,"forzar_voto":null}') where codigo = s.codigo;
  perform _duerme_ping(s.codigo);
end $$;

-- p_cfg: {ver_roles: bool, forzar_marca: id|null, forzar_voto: id|null}; las claves que falten no cambian
create or replace function public.duerme_pruebas(p_codigo text, p_token text, p_cfg jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare r duerme_jugadores := _duerme_yo(p_codigo, p_token); s duerme_salas; c jsonb;
begin
  if not _duerme_pruebas() then raise exception 'sin_pruebas'; end if;
  select * into s from duerme_salas where codigo = r.codigo for update;
  if s.anfitrion <> r.id then raise exception 'solo_anfitrion'; end if;
  c := coalesce(s.pruebas, '{"ver_roles":false,"forzar_marca":null,"forzar_voto":null}');
  if p_cfg ? 'ver_roles' then c := c || jsonb_build_object('ver_roles', coalesce((p_cfg->>'ver_roles')::boolean, false)); end if;
  if p_cfg ? 'forzar_marca' then c := c || jsonb_build_object('forzar_marca', nullif(p_cfg->>'forzar_marca', '')); end if;
  if p_cfg ? 'forzar_voto' then c := c || jsonb_build_object('forzar_voto', nullif(p_cfg->>'forzar_voto', '')); end if;
  update duerme_salas set pruebas = c where codigo = s.codigo;
  perform _duerme_ping(s.codigo);
end $$;

-- ---------- Cerebro de los bots ----------
-- Un paso de un bot según su papel. Para los papeles de la fase 2 (Bruja, Cupido, Vidente) basta con añadir su rama
-- aquí (y su fase en _duerme_bot_tick); el calendario aleatorio y el panel de pruebas ya sirven para todos.
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
    if b.rol = 'punto' then
      if b.bot_paso = 0 then
        t := _duerme_bot_objetivo_punto(p_codigo, p_id, fm);
        if t is not null then perform _duerme_actuar_id(p_codigo, p_id, 'marca', t); end if;
        update duerme_jugadores set bot_paso = 1, bot_at = now() + seg * interval '1 second' where codigo = p_codigo and id = p_id;
      else
        -- antes de confirmar, coincidir con los demás Puntos (si alguno ha cambiado de objetivo)
        t := _duerme_bot_objetivo_punto(p_codigo, p_id, fm);
        if t is not null then perform _duerme_actuar_id(p_codigo, p_id, 'marca', t); end if;
        perform _duerme_actuar_id(p_codigo, p_id, 'confirma', null);
        update duerme_jugadores set bot_at = null where codigo = p_codigo and id = p_id;
      end if;
    else -- Ciego (y, por ahora, cualquier otro papel): marca por tapadera y confirma
      if b.bot_paso = 0 then
        t := _duerme_bot_azar(p_codigo, p_id, false, fm);
        if t is not null then perform _duerme_actuar_id(p_codigo, p_id, 'marca', t); end if;
        update duerme_jugadores set bot_paso = 1, bot_at = now() + seg * interval '1 second' where codigo = p_codigo and id = p_id;
      else
        perform _duerme_actuar_id(p_codigo, p_id, 'confirma', null);
        update duerme_jugadores set bot_at = null where codigo = p_codigo and id = p_id;
      end if;
    end if;

  elsif s.fase = 'votacion' then
    t := _duerme_bot_azar(p_codigo, p_id, false, fv);
    if t is not null then perform _duerme_actuar_id(p_codigo, p_id, 'voto', t); end if;
    update duerme_jugadores set bot_at = null where codigo = p_codigo and id = p_id;
  end if;
end $$;

-- Jugador vivo al azar (nunca el propio bot). Si p_forzado es un jugador válido, ese.
create or replace function public._duerme_bot_azar(p_codigo text, p_id text, p_sin_puntos boolean, p_forzado text) returns text
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if p_forzado is not null then
    select id into t from duerme_jugadores
     where codigo = p_codigo and id = p_forzado and id <> p_id and vivo and juega and not fuera and not (p_sin_puntos and rol = 'punto');
    if t is not null then return t; end if;
  end if;
  select id into t from duerme_jugadores
   where codigo = p_codigo and id <> p_id and vivo and juega and not fuera and not (p_sin_puntos and rol = 'punto')
   order by random() limit 1;
  return t;
end $$;

-- Objetivo de un Punto bot: el forzado; si no, el de otro Punto que ya haya marcado (los humanos mandan sobre los bots);
-- si no, uno al azar entre los que no son Puntos. Así dos Puntos bots acaban coincidiendo.
create or replace function public._duerme_bot_objetivo_punto(p_codigo text, p_id text, p_forzado text) returns text
language plpgsql security definer set search_path = public as $$
declare s duerme_salas; t text;
begin
  select * into s from duerme_salas where codigo = p_codigo;
  if p_forzado is not null then
    select id into t from duerme_jugadores
     where codigo = p_codigo and id = p_forzado and vivo and juega and not fuera and rol <> 'punto';
    if t is not null then return t; end if;
  end if;
  select a.objetivo into t from duerme_acciones a
    join duerme_jugadores j on j.codigo = a.codigo and j.id = a.id and j.rol = 'punto' and j.vivo and j.id <> p_id
   where a.codigo = p_codigo and a.ronda = s.ronda and a.fase = 'noche' and a.tipo = 'marca'
   order by j.bot, a.creada limit 1;
  if t is not null then return t; end if;
  return _duerme_bot_azar(p_codigo, p_id, true, null);
end $$;

-- Reloj de los bots: lo llama cualquier móvil de la sala (el del anfitrión, cada pocos segundos, en las pruebas).
-- Programa a cada bot con un retraso aleatorio de 2–7 s al empezar cada fase y ejecuta los que ya les toca.
create or replace function public.duerme_tick(p_codigo text, p_token text) returns void
language plpgsql security definer set search_path = public as $$
declare r duerme_jugadores := _duerme_yo(p_codigo, p_token); s duerme_salas; b record; clave text; k int := 0;
begin
  select * into s from duerme_salas where codigo = r.codigo for update;
  if s.pruebas is null or not _duerme_pruebas() then return; end if;
  if s.fase not in ('reparto', 'noche', 'votacion') then return; end if;
  clave := s.ronda || ':' || s.fase;
  for b in select id from duerme_jugadores where codigo = s.codigo and bot and vivo and not fuera order by orden loop
    k := k + 1; exit when k > 25;
    -- si una acción anterior cambió de fase, se deja para el próximo tick
    if (select fase || ronda from duerme_salas where codigo = s.codigo) is distinct from (s.fase || s.ronda) then exit; end if;
    perform 1 from duerme_jugadores where codigo = s.codigo and id = b.id and bot_clave is distinct from clave;
    if found then
      update duerme_jugadores set bot_clave = clave, bot_paso = 0, bot_at = now() + (2 + random() * 5) * interval '1 second'
       where codigo = s.codigo and id = b.id;
    else
      perform 1 from duerme_jugadores where codigo = s.codigo and id = b.id and bot_at is not null and bot_at <= now();
      if found then perform _duerme_bot_paso(s.codigo, b.id); end if;
    end if;
  end loop;
end $$;

-- ---------- Vista: bots visibles (y sus papeles solo para el anfitrión con «ver roles») ----------
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
        'rol', case when fin or j.id = r.id or (punto and j.rol = 'punto') or (ver and j.bot) then j.rol end) order by j.orden), '[]')
      from duerme_jugadores j where j.codigo = s.codigo),
    'yo', jsonb_build_object('id', r.id, 'rol', r.rol, 'vivo', r.vivo, 'juega', r.juega),
    'marcas', case when punto and s.fase = 'noche' then (
        select coalesce(jsonb_object_agg(a.id, a.objetivo), '{}') from duerme_acciones a
          join duerme_jugadores j on j.codigo = a.codigo and j.id = a.id and j.rol = 'punto' and j.vivo
         where a.codigo = s.codigo and a.ronda = s.ronda and a.fase = 'noche' and a.tipo = 'marca') end,
    'mio', (select coalesce(jsonb_object_agg(a.tipo, coalesce(a.objetivo, '')), '{}') from duerme_acciones a
             where a.codigo = s.codigo and a.ronda = s.ronda and a.fase = s.fase and a.id = r.id),
    'votos', case when s.fase = 'votacion' then (
        select count(*) from duerme_acciones a join duerme_jugadores j on j.codigo = a.codigo and j.id = a.id and j.vivo
         where a.codigo = s.codigo and a.ronda = s.ronda and a.fase = 'votacion' and a.tipo = 'voto') end);
end $$;

-- Permisos (igual que siempre: solo las funciones públicas duerme_*)
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
