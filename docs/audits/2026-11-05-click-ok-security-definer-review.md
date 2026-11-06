# CLICK OK — Revisión inicial de funciones SECURITY DEFINER

Fecha: 5 de noviembre de 2026
Rama: click-ok-produccion
Proyecto: Supabase CLICKOK

## Inventario

El catálogo PostgreSQL reporta 13 funciones SECURITY DEFINER: adjust_product_stock, advance_order_status, close_cash_session, configure_product_inventory, create_business, handle_new_auth_user, has_business_role, is_business_member, open_cash_session, record_cash_movement, record_order_status_history, rls_auto_enable y set_business_type.

Todas tienen propietario postgres y search_path vacío, excepto rls_auto_enable que fija pg_catalog. Esto reduce riesgos de resolución de objetos, pero no certifica el contenido de las funciones.

## Privilegios observados

EXECUTE para authenticated aparece en las RPC de negocio y operación: adjust_product_stock, advance_order_status, funciones de caja, create_business, helpers de rol/membresía y set_business_type. Las funciones de trigger handle_new_auth_user, record_order_status_history y rls_auto_enable no aparecen concedidas a authenticated. set_updated_at tiene EXECUTE para PUBLIC, pero no es SECURITY DEFINER y se usa como trigger.

## Definiciones revisadas

- has_business_role(uuid, business_role[]): valida auth.uid(), membresía activa, business_id y rol solicitado. Usa search_path vacío.
- adjust_product_stock(...): exige autenticación, valida movimiento y cantidad, bloquea el producto, obtiene business_id desde el registro del producto y exige owner/admin/inventory. No confía en business_id enviado por cliente.

## Pendientes

No se terminó el análisis del cuerpo de las otras RPC en esta pasada. Revisar individualmente advance_order_status, create_business, close_cash_session, configure_product_inventory, open_cash_session, record_cash_movement, set_business_type e is_business_member. Confirmar para cada una validación de tenant/rol, validación de entradas y REVOKE EXECUTE de PUBLIC/anon con grants mínimos.

No se modificaron funciones ni privilegios. No se aplicaron permisos generales. Esta revisión no equivale a certificación de seguridad; faltan pruebas negativas con dos negocios y usuarios independientes.
