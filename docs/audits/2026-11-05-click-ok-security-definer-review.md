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


## Revisión ampliada de las RPC restantes — 5 de noviembre de 2026

Se inspeccionaron las definiciones activas directamente en PostgreSQL:

- `advance_order_status(uuid, order_status)`: localiza el pedido por ID, obtiene el negocio desde la fila, exige membresía activa y uno de los roles permitidos, y valida las transiciones de estado. No recibe business_id del cliente. Correcto en el control de tenant/rol revisado.
- `close_cash_session(uuid, bigint, text)`: bloquea la sesión, obtiene su negocio desde la fila, exige owner/admin/cashier, valida estado abierto y montos, y calcula el cierre desde movimientos del mismo negocio/sesión. Correcto en control de tenant/rol.
- `configure_product_inventory(uuid, boolean, integer, integer)`: obtiene el negocio desde el producto bloqueado y exige owner/admin/inventory; valida cantidades y registra ajuste inicial. Correcto en control de tenant/rol.
- `create_business(text, text)`: exige auth.uid(), valida nombre/slug, crea el negocio y crea membresía owner para el usuario autenticado en la misma función. Correcto en la asignación de propietario. Recomendación menor: endurecer validación de NULL y normalización del slug.
- `is_business_member(uuid)`: consulta únicamente la membresía activa del auth.uid() actual y el business_id solicitado. Correcto como helper de RLS.
- `open_cash_session(uuid, bigint, text)`: exige owner/admin/cashier sobre el business_id solicitado y valida montos. La restricción única parcial de sesión abierta por negocio evita dos aperturas simultáneas.
- `record_cash_movement(uuid, text, bigint, text, uuid)`: obtiene negocio desde la sesión bloqueada, exige que esté abierta y owner/admin/cashier, y registra created_by desde auth.uid(). Correcto en control de tenant/rol.
- `set_business_type(uuid, text)`: exige owner/admin del negocio solicitado y sector activo antes de actualizar. Correcto en control de tenant/rol.

## Resultado de privilegios

La consulta de ACL de PostgreSQL confirma que las funciones anteriores concedidas a usuarios de negocio tienen EXECUTE para `authenticated` y no muestran ACL para PUBLIC ni anon. Las funciones internas de trigger `handle_new_auth_user`, `record_order_status_history` y `rls_auto_enable` solo muestran EXECUTE para postgres. Esto es consistente con privilegio mínimo.

## Observaciones y riesgos residuales

1. `record_cash_movement` acepta `p_reference_id` sin validar la pertenencia del registro referenciado. Actualmente es un identificador de referencia genérico y no altera el tenant de la sesión, pero antes de enlazarlo con ventas, devoluciones o compras debe validarse contra la tabla y el mismo business_id.
2. `create_business` debe rechazar explícitamente parámetros NULL y normalizar slug/nombre para evitar errores inconsistentes; no se observó escalamiento de privilegios en la definición actual.
3. Las pruebas de aislamiento entre dos usuarios y dos negocios no se han ejecutado. La revisión estática no reemplaza pruebas reales de RLS, RPC ni endpoints.
4. La revisión de funciones SECURITY DEFINER queda completada a nivel estático de las 13 funciones inventariadas; no es una certificación integral de toda la API ni de producción.

## Conclusión

No se encontró en las definiciones revisadas una vulnerabilidad evidente de acceso cruzado entre negocios en las ocho RPC analizadas. Se confirma search_path restringido y ACL sin PUBLIC/anon en las funciones SECURITY DEFINER inventariadas. No se modificaron funciones, grants ni datos durante esta revisión.
