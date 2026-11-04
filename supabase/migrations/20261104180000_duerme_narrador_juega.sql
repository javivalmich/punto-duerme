-- El narrador es un jugador más: se quita «anf_juega». El anfitrión siempre juega.
-- (La columna duerme_jugadores.juega se queda por si algún día hace falta; ahora siempre es true.)
create or replace function public._duerme_config(p_nueva jsonb, p_vieja jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare b jsonb := '{"puntos":null,"t_noche":30,"t_debate":180,"t_voto":60,"revelar":true}'::jsonb
                   || coalesce(p_vieja, '{}') || coalesce(p_nueva, '{}');
begin
  return jsonb_build_object(
    'puntos',    case when jsonb_typeof(b->'puntos') = 'number' then greatest(1, least(6, (b->>'puntos')::int)) end,
    't_noche',   greatest(10, least(180, (b->>'t_noche')::int)),
    't_debate',  greatest(30, least(900, (b->>'t_debate')::int)),
    't_voto',    greatest(15, least(300, (b->>'t_voto')::int)),
    'revelar',   (b->>'revelar')::boolean);
end $$;

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
       values (c, yo, t, _duerme_limpia_nombre(p_nombre), p_look, 1, true);
  return jsonb_build_object('codigo', c, 'id', yo, 'token', t);
end $$;

create or replace function public.duerme_configurar(p_codigo text, p_token text, p_config jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare r duerme_jugadores := _duerme_yo(p_codigo, p_token); s duerme_salas;
begin
  select * into s from duerme_salas where codigo = r.codigo for update;
  if s.anfitrion <> r.id then raise exception 'solo_anfitrion'; end if;
  if s.fase not in ('sala', 'final') then raise exception 'empezada'; end if;
  update duerme_salas set config = _duerme_config(p_config, s.config) where codigo = r.codigo;
  perform _duerme_ping(r.codigo);
end $$;

-- Salas que ya existan: todos juegan y la config pierde la clave vieja.
update duerme_jugadores set juega = true where not juega;
update duerme_salas set config = config - 'anf_juega';

-- Las funciones nuevas heredan el permiso público: se vuelve a dejar como estaba.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as fn, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like '%duerme%' loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.fn);
    if f.proname like 'duerme\_%' then execute format('grant execute on function %s to anon, authenticated', f.fn); end if;
  end loop;
end $$;
