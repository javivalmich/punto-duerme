-- Punto Duerme · fase 1 (Punto y Ciego, modo «cada uno con su móvil").
-- El servidor manda: los roles y las acciones viven en estas tablas y ningún cliente puede leerlas.
-- Todo pasa por las funciones duerme_* (security definer), que reciben el token secreto de cada jugador
-- y devuelven solo lo que ese jugador puede ver. Cada cambio sube `version` y avisa por Realtime
-- (canal público `duerme-<CÓDIGO>`, evento `v`, sin secretos); los móviles piden entonces duerme_vista.

create table public.duerme_salas (
  codigo     text primary key,
  creada     timestamptz not null default now(),
  tocada     timestamptz not null default now(),
  anfitrion  text not null,
  narrador   text,
  config     jsonb not null default '{}',
  fase       text not null default 'sala',
  fase_desde timestamptz not null default now(),
  fase_hasta timestamptz,
  ronda      int not null default 0,
  version    int not null default 1,
  publico    jsonb not null default '{}'
);

create table public.duerme_jugadores (
  codigo text not null references public.duerme_salas(codigo) on delete cascade,
  id     text not null,
  token  text not null unique,
  nombre text not null,
  look   jsonb,
  orden  int not null,
  juega  boolean not null default true,
  rol    text,
  vivo   boolean not null default true,
  listo  boolean not null default false,
  fuera  boolean not null default false,
  primary key (codigo, id)
);

create table public.duerme_acciones (
  codigo   text not null references public.duerme_salas(codigo) on delete cascade,
  ronda    int not null,
  fase     text not null,
  id       text not null,
  tipo     text not null,
  objetivo text,
  creada   timestamptz not null default now(),
  primary key (codigo, ronda, fase, id, tipo)
);

alter table public.duerme_salas enable row level security;
alter table public.duerme_jugadores enable row level security;
alter table public.duerme_acciones enable row level security;
revoke all on public.duerme_salas, public.duerme_jugadores, public.duerme_acciones from anon, authenticated;

-- ---------- Ayudantes internos (no se pueden llamar desde fuera) ----------

create or replace function public._duerme_ping(p_codigo text) returns void
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  update duerme_salas set version = version + 1, tocada = now() where codigo = p_codigo returning version into v;
  begin
    perform realtime.send(jsonb_build_object('v', v), 'v', 'duerme-' || p_codigo, false);
  exception when others then null; -- si Realtime falla, los móviles se ponen al día al reconectar
  end;
end $$;

create or replace function public._duerme_fase(p_codigo text, p_fase text, p_seg int) returns void
language plpgsql security definer set search_path = public as $$
begin
  update duerme_salas
     set fase = p_fase, fase_desde = now(),
         fase_hasta = case when p_seg is null then null else now() + make_interval(secs => p_seg) end
   where codigo = p_codigo;
  perform _duerme_ping(p_codigo);
end $$;

create or replace function public._duerme_yo(p_codigo text, p_token text) returns duerme_jugadores
language plpgsql security definer set search_path = public as $$
declare r duerme_jugadores;
begin
  select * into r from duerme_jugadores where codigo = upper(p_codigo) and token = p_token;
  if not found then raise exception 'no_estas'; end if;
  return r;
end $$;

create or replace function public._duerme_limpia_nombre(p text) returns text
language sql immutable set search_path = public as $$
  select coalesce(nullif(left(btrim(regexp_replace(regexp_replace(coalesce(p, ''), '[<>~#]', '', 'g'), '\s+', ' ', 'g')), 16), ''), 'Jugador')
$$;

-- Nombre único dentro de la sala: «Ana», «Ana2», «Ana3»…
create or replace function public._duerme_nombre_libre(p_codigo text, p_nombre text, p_excluir text) returns text
language plpgsql security definer set search_path = public as $$
declare b text := _duerme_limpia_nombre(p_nombre); x text := b; i int := 2;
begin
  while exists (select 1 from duerme_jugadores
                 where codigo = p_codigo and lower(nombre) = lower(x) and id is distinct from p_excluir and not fuera) loop
    x := left(b, 14) || i; i := i + 1;
  end loop;
  return x;
end $$;

-- Ajustes de la partida: valores por defecto + los anteriores + los nuevos, siempre dentro de rango.
-- puntos = null significa «el sugerido según el número de jugadores».
create or replace function public._duerme_config(p_nueva jsonb, p_vieja jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare b jsonb := '{"puntos":null,"t_noche":30,"t_debate":180,"t_voto":60,"revelar":true,"anf_juega":true}'::jsonb
                   || coalesce(p_vieja, '{}') || coalesce(p_nueva, '{}');
begin
  return jsonb_build_object(
    'puntos',    case when jsonb_typeof(b->'puntos') = 'number' then greatest(1, least(6, (b->>'puntos')::int)) end,
    't_noche',   greatest(10, least(180, (b->>'t_noche')::int)),
    't_debate',  greatest(30, least(900, (b->>'t_debate')::int)),
    't_voto',    greatest(15, least(300, (b->>'t_voto')::int)),
    'revelar',   (b->>'revelar')::boolean,
    'anf_juega', (b->>'anf_juega')::boolean);
end $$;

-- Puntos sugeridos: 4–5 jugadores → 1, 6–8 → 2, 9–11 → 3, 12 o más → 4. Nunca la mitad o más.
create or replace function public._duerme_puntos(p_n int, p_pedidos int) returns int
language sql immutable set search_path = public as $$
  select greatest(1, least(coalesce(p_pedidos, case when p_n <= 5 then 1 when p_n <= 8 then 2 when p_n <= 11 then 3 else 4 end),
                           (p_n - 1) / 2))
$$;

create or replace function public._duerme_ganador(p_codigo text) returns text
language plpgsql security definer set search_path = public as $$
declare p int; o int;
begin
  select count(*) filter (where rol = 'punto'), count(*) filter (where rol is distinct from 'punto')
    into p, o from duerme_jugadores where codigo = p_codigo and juega and vivo;
  if p = 0 then return 'ciegos'; end if;
  if p >= o then return 'puntos'; end if;
  return null;
end $$;

create or replace function public._duerme_final(p_codigo text, p_ganador text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update duerme_salas set publico = publico || jsonb_build_object('ganador', p_ganador) where codigo = p_codigo;
  perform _duerme_fase(p_codigo, 'final', null);
end $$;

create or replace function public._duerme_anochece(p_codigo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update duerme_salas set ronda = ronda + 1, publico = '{}' where codigo = p_codigo;
  perform _duerme_fase(p_codigo, 'anochece', 40);
end $$;

-- Fin de la noche: muere el objetivo de los Puntos (el que han confirmado o, si se acaba el tiempo,
-- el más marcado entre los Puntos vivos; si hay empate, nadie).
create or replace function public._duerme_noche_fin(p_codigo text) returns void
language plpgsql security definer set search_path = public as $$
declare s duerme_salas; v text; n1 int; n2 int; muertos jsonb := '[]'; r duerme_jugadores;
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
  if v is not null and (n2 is null or n2 < n1) then
    update duerme_jugadores set vivo = false where codigo = p_codigo and id = v and vivo and juega returning * into r;
    if found then
      muertos := jsonb_build_array(jsonb_build_object('id', r.id,
                   'rol', case when (s.config->>'revelar')::boolean then r.rol end));
    end if;
  end if;
  update duerme_salas set publico = jsonb_build_object('muertos', muertos) where codigo = p_codigo;
  perform _duerme_fase(p_codigo, 'amanece', 40);
end $$;

-- Fin de la votación: cuentan los votos emitidos por jugadores vivos a jugadores vivos.
-- El más votado queda eliminado; si hay empate (o nadie ha votado), nadie.
create or replace function public._duerme_voto_fin(p_codigo text) returns void
language plpgsql security definer set search_path = public as $$
declare s duerme_salas; rec jsonb; v text; n1 int; n2 int; r duerme_jugadores; elim jsonb := null;
begin
  select * into s from duerme_salas where codigo = p_codigo;
  select coalesce(jsonb_agg(jsonb_build_object('id', objetivo, 'n', n) order by n desc), '[]') into rec from (
    select a.objetivo, count(*) n from duerme_acciones a
      join duerme_jugadores j on j.codigo = a.codigo and j.id = a.id and j.vivo and j.juega
      join duerme_jugadores o on o.codigo = a.codigo and o.id = a.objetivo and o.vivo and o.juega
     where a.codigo = p_codigo and a.ronda = s.ronda and a.fase = 'votacion' and a.tipo = 'voto'
     group by a.objetivo) t;
  v := rec->0->>'id'; n1 := (rec->0->>'n')::int; n2 := (rec->1->>'n')::int;
  if v is not null and (n2 is null or n2 < n1) then
    update duerme_jugadores set vivo = false where codigo = p_codigo and id = v returning * into r;
    elim := jsonb_build_object('id', r.id, 'rol', case when (s.config->>'revelar')::boolean then r.rol end);
  end if;
  update duerme_salas set publico = jsonb_build_object('eliminado', elim, 'recuento', rec) where codigo = p_codigo;
  perform _duerme_fase(p_codigo, 'resultado', 40);
end $$;

-- Sale un jugador: en la sala de espera o al final desaparece; en plena partida queda fuera (como muerto).
-- Si era el anfitrión o el narrador, pasa al siguiente por orden de llegada. Si no queda nadie, se borra la sala.
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
  select id into sig from duerme_jugadores where codigo = p_codigo and not fuera order by orden limit 1;
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

-- ---------- Funciones públicas ----------

create or replace function public.duerme_crear(p_nombre text, p_look jsonb, p_config jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; c text; i int; t text := gen_random_uuid()::text;
        yo text := left(md5(gen_random_uuid()::text), 8); cfg jsonb := _duerme_config(p_config, null);
begin
  delete from duerme_salas where tocada < now() - interval '1 day';
  loop
    c := '';
    for i in 1..5 loop c := c || substr(a, 1 + floor(random() * length(a))::int, 1); end loop;
    exit when not exists (select 1 from duerme_salas where codigo = c);
  end loop;
  insert into duerme_salas (codigo, anfitrion, narrador, config) values (c, yo, yo, cfg);
  insert into duerme_jugadores (codigo, id, token, nombre, look, orden, juega)
       values (c, yo, t, _duerme_limpia_nombre(p_nombre), p_look, 1, (cfg->>'anf_juega')::boolean);
  return jsonb_build_object('codigo', c, 'id', yo, 'token', t);
end $$;

create or replace function public.duerme_unirse(p_codigo text, p_nombre text, p_look jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s duerme_salas; t text := gen_random_uuid()::text; yo text := left(md5(gen_random_uuid()::text), 8);
begin
  select * into s from duerme_salas where codigo = upper(p_codigo) for update;
  if not found then raise exception 'no_existe'; end if;
  if s.fase <> 'sala' then raise exception 'empezada'; end if;
  if (select count(*) from duerme_jugadores where codigo = s.codigo) >= 20 then raise exception 'llena'; end if;
  insert into duerme_jugadores (codigo, id, token, nombre, look, orden)
       values (s.codigo, yo, t, _duerme_nombre_libre(s.codigo, p_nombre, null), p_look,
               (select coalesce(max(orden), 0) + 1 from duerme_jugadores where codigo = s.codigo));
  perform _duerme_ping(s.codigo);
  return jsonb_build_object('codigo', s.codigo, 'id', yo, 'token', t);
end $$;

-- Cambiar nombre (solo en la sala de espera) y personaje (cuando sea).
create or replace function public.duerme_perfil(p_codigo text, p_token text, p_nombre text, p_look jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare r duerme_jugadores := _duerme_yo(p_codigo, p_token); s duerme_salas;
begin
  select * into s from duerme_salas where codigo = r.codigo for update;
  update duerme_jugadores
     set look = p_look,
         nombre = case when s.fase = 'sala' and p_nombre is not null then _duerme_nombre_libre(r.codigo, p_nombre, r.id) else nombre end
   where codigo = r.codigo and id = r.id;
  perform _duerme_ping(r.codigo);
end $$;

create or replace function public.duerme_configurar(p_codigo text, p_token text, p_config jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare r duerme_jugadores := _duerme_yo(p_codigo, p_token); s duerme_salas;
begin
  select * into s from duerme_salas where codigo = r.codigo for update;
  if s.anfitrion <> r.id then raise exception 'solo_anfitrion'; end if;
  if s.fase not in ('sala', 'final') then raise exception 'empezada'; end if;
  update duerme_salas set config = _duerme_config(p_config, s.config) where codigo = r.codigo returning * into s;
  update duerme_jugadores set juega = (s.config->>'anf_juega')::boolean where codigo = r.codigo and id = s.anfitrion;
  perform _duerme_ping(r.codigo);
end $$;

create or replace function public.duerme_salir(p_codigo text, p_token text) returns void
language plpgsql security definer set search_path = public as $$
declare r duerme_jugadores;
begin
  begin r := _duerme_yo(p_codigo, p_token); exception when others then return; end;
  perform 1 from duerme_salas where codigo = r.codigo for update;
  perform _duerme_quita(r.codigo, r.id);
end $$;

create or replace function public.duerme_expulsar(p_codigo text, p_token text, p_id text) returns void
language plpgsql security definer set search_path = public as $$
declare r duerme_jugadores := _duerme_yo(p_codigo, p_token); s duerme_salas;
begin
  select * into s from duerme_salas where codigo = r.codigo for update;
  if s.anfitrion <> r.id then raise exception 'solo_anfitrion'; end if;
  if s.fase <> 'sala' or p_id = r.id then return; end if;
  perform _duerme_quita(r.codigo, p_id);
end $$;

create or replace function public.duerme_empezar(p_codigo text, p_token text) returns void
language plpgsql security definer set search_path = public as $$
declare r duerme_jugadores := _duerme_yo(p_codigo, p_token); s duerme_salas; n int; k int;
begin
  select * into s from duerme_salas where codigo = r.codigo for update;
  if s.anfitrion <> r.id then raise exception 'solo_anfitrion'; end if;
  if s.fase <> 'sala' then raise exception 'empezada'; end if;
  select count(*) into n from duerme_jugadores where codigo = s.codigo and juega and not fuera;
  if n < 4 then raise exception 'pocos'; end if;
  k := _duerme_puntos(n, (s.config->>'puntos')::int);
  update duerme_jugadores set rol = case when juega then 'ciego' end, vivo = juega, listo = false where codigo = s.codigo;
  update duerme_jugadores set rol = 'punto'
   where codigo = s.codigo and id in (select id from duerme_jugadores where codigo = s.codigo and juega order by random() limit k);
  delete from duerme_acciones where codigo = s.codigo;
  update duerme_salas set ronda = 0, publico = '{}', narrador = coalesce(narrador, anfitrion) where codigo = s.codigo;
  perform _duerme_fase(s.codigo, 'reparto', 90);
end $$;

-- Acciones de los jugadores: listo (reparto), marca y confirma (noche), voto (votación),
-- votar_ya (el anfitrión o el narrador corta el debate).
create or replace function public.duerme_actuar(p_codigo text, p_token text, p_tipo text, p_objetivo text) returns void
language plpgsql security definer set search_path = public as $$
declare r duerme_jugadores := _duerme_yo(p_codigo, p_token); s duerme_salas; o duerme_jugadores;
        vivos_p int; marcados int; distintos int; mio text; faltan int;
begin
  select * into s from duerme_salas where codigo = r.codigo for update;
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

-- Pasa a la fase siguiente si ya se ha acabado el tiempo, o antes si quien lo pide es el narrador
-- y es una fase narrada (el narrador la cierra al terminar de hablar). Es idempotente: si la fase
-- ya no es p_fase, no hace nada, así que da igual cuántos móviles la llamen a la vez.
create or replace function public.duerme_avanzar(p_codigo text, p_token text, p_fase text) returns void
language plpgsql security definer set search_path = public as $$
declare r duerme_jugadores := _duerme_yo(p_codigo, p_token); s duerme_salas; g text;
begin
  select * into s from duerme_salas where codigo = r.codigo for update;
  if s.fase <> p_fase then return; end if;
  if not ((s.fase_hasta is not null and now() >= s.fase_hasta - interval '300 milliseconds')
          or (r.id = s.narrador and s.fase in ('anochece', 'amanece', 'resultado'))) then
    return;
  end if;
  if s.fase = 'reparto' then perform _duerme_anochece(s.codigo);
  elsif s.fase = 'anochece' then perform _duerme_fase(s.codigo, 'noche', (s.config->>'t_noche')::int);
  elsif s.fase = 'noche' then perform _duerme_noche_fin(s.codigo);
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

create or replace function public.duerme_ser_narrador(p_codigo text, p_token text) returns void
language plpgsql security definer set search_path = public as $$
declare r duerme_jugadores := _duerme_yo(p_codigo, p_token);
begin
  perform 1 from duerme_salas where codigo = r.codigo for update;
  update duerme_salas set narrador = r.id where codigo = r.codigo;
  perform _duerme_ping(r.codigo);
end $$;

-- El anfitrión vuelve a la sala de espera (al final, u ofreciendo terminar la partida en curso).
create or replace function public.duerme_a_la_sala(p_codigo text, p_token text) returns void
language plpgsql security definer set search_path = public as $$
declare r duerme_jugadores := _duerme_yo(p_codigo, p_token); s duerme_salas;
begin
  select * into s from duerme_salas where codigo = r.codigo for update;
  if s.anfitrion <> r.id then raise exception 'solo_anfitrion'; end if;
  delete from duerme_jugadores where codigo = s.codigo and fuera;
  update duerme_jugadores set rol = null, vivo = true, listo = false where codigo = s.codigo;
  delete from duerme_acciones where codigo = s.codigo;
  update duerme_salas set ronda = 0, publico = '{}' where codigo = s.codigo;
  perform _duerme_fase(s.codigo, 'sala', null);
end $$;

-- Lo que ve este jugador: lo público de la sala y, de lo secreto, solo lo suyo.
-- Roles ajenos: los compañeros Puntos se ven entre sí; todos los roles, solo en la pantalla final.
create or replace function public.duerme_vista(p_codigo text, p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r duerme_jugadores := _duerme_yo(p_codigo, p_token); s duerme_salas; punto boolean; fin boolean;
begin
  select * into s from duerme_salas where codigo = r.codigo;
  punto := r.rol = 'punto' and s.fase <> 'sala';
  fin := s.fase = 'final';
  return jsonb_build_object(
    'ahora', floor(extract(epoch from clock_timestamp()) * 1000),
    'sala', jsonb_build_object(
      'codigo', s.codigo, 'fase', s.fase, 'ronda', s.ronda, 'version', s.version, 'config', s.config,
      'desde', floor(extract(epoch from s.fase_desde) * 1000),
      'hasta', case when s.fase_hasta is not null then floor(extract(epoch from s.fase_hasta) * 1000) end,
      'anfitrion', s.anfitrion, 'narrador', s.narrador, 'publico', s.publico),
    'jugadores', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', j.id, 'nombre', j.nombre, 'look', j.look, 'orden', j.orden, 'juega', j.juega,
        'vivo', j.vivo, 'fuera', j.fuera, 'listo', j.listo,
        'rol', case when fin or j.id = r.id or (punto and j.rol = 'punto') then j.rol end) order by j.orden), '[]')
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

-- Permisos: solo las funciones públicas, para cualquiera (con o sin cuenta). No toca funciones de otros juegos.
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
