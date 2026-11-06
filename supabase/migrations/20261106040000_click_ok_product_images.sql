-- Product photos for CLICK OK storefronts. Additive; existing products remain valid.
alter table public.products add column if not exists image_url text;
alter table public.products drop constraint if exists products_image_url_check;
alter table public.products add constraint products_image_url_check check (image_url is null or (char_length(image_url)<=2048 and image_url ~ '^https?://'));

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('click-ok-product-images','click-ok-product-images',true,5242880,array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists click_ok_product_images_insert on storage.objects;
create policy click_ok_product_images_insert on storage.objects for insert to authenticated
with check (bucket_id='click-ok-product-images' and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
and public.has_business_role(((storage.foldername(name))[1])::uuid,array['owner','admin','editor']::public.business_role[]));

drop policy if exists click_ok_product_images_update on storage.objects;
create policy click_ok_product_images_update on storage.objects for update to authenticated
using (bucket_id='click-ok-product-images' and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
and public.has_business_role(((storage.foldername(name))[1])::uuid,array['owner','admin','editor']::public.business_role[]))
with check (bucket_id='click-ok-product-images' and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
and public.has_business_role(((storage.foldername(name))[1])::uuid,array['owner','admin','editor']::public.business_role[]));

drop policy if exists click_ok_product_images_delete on storage.objects;
create policy click_ok_product_images_delete on storage.objects for delete to authenticated
using (bucket_id='click-ok-product-images' and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
and public.has_business_role(((storage.foldername(name))[1])::uuid,array['owner','admin','editor']::public.business_role[]));

create or replace function public.get_public_storefront(p_slug text)
returns jsonb language sql stable security definer set search_path = ''
as $$
select jsonb_build_object(
'business',jsonb_build_object('id',b.id,'name',b.name,'business_type_id',b.business_type_id),
'page',jsonb_build_object('slug',pp.slug,'template_key',pp.template_key,'theme',pp.theme,'content',pp.content,'contact',pp.contact,'seo',pp.seo),
'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'sort_order',c.sort_order) order by c.sort_order) from public.categories c where c.business_id=b.id and c.active=true),'[]'::jsonb),
'products',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'description',p.description,'price_cop',p.price_cop,'available',p.available,'featured',p.featured,'category_id',p.category_id,'image_url',p.image_url) order by p.featured desc,p.created_at desc) from public.products p where p.business_id=b.id and p.available=true),'[]'::jsonb))
from public.business_public_pages pp join public.businesses b on b.id=pp.business_id
where pp.slug=p_slug and pp.published=true and b.status='active' limit 1;
$$;
revoke all on function public.get_public_storefront(text) from public,anon,authenticated;
grant execute on function public.get_public_storefront(text) to anon,authenticated;
comment on function public.get_public_storefront(text) is 'Returns published storefront data and available products, including public product image URLs.';
