create index registros_comprador_evento_idx on public.registros (comprador_id, evento_id);

-- Never accept a buyer id from the client. Even organizers only see their purchases.
-- A definer is needed to retain the buyer's event details when it returns to draft.
create function public.mis_boletos(p_evento_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  comprador uuid := auth.uid();
  resultado jsonb;
begin
  if comprador is null then
    raise exception 'Se requiere una sesión válida' using errcode = '42501';
  end if;
  select jsonb_build_object('comprador_id', comprador, 'ahora', statement_timestamp(), 'eventos', coalesce(jsonb_agg(
    jsonb_build_object('id', e.id, 'titulo', e.titulo, 'fecha', e.fecha,
      'lugar', e.lugar, 'estado', e.estado,
      'boletos', (select jsonb_agg(jsonb_build_object(
        'id', r.id, 'nombre_titular', r.nombre_titular, 'correo_titular', r.correo_titular,
        'tipo_entrada', t.nombre, 'created_at', r.created_at
      ) order by r.created_at, r.id)
        from public.registros r join public.tipos_entrada t on t.id = r.tipo_entrada_id
        where r.evento_id = e.id and r.comprador_id = comprador)
    ) order by e.fecha, e.id), '[]'::jsonb)) into resultado
  from public.eventos e
  where (p_evento_id is null or e.id = p_evento_id)
    and exists (select 1 from public.registros r where r.evento_id = e.id and r.comprador_id = comprador);
  return resultado;
end;
$$;
revoke all on function public.mis_boletos(uuid) from public, anon, authenticated;
grant execute on function public.mis_boletos(uuid) to authenticated;
