# CLICK OK — Auditoría técnica inicial del núcleo SaaS

Fecha: 2026-11-05  
Repositorio: `juanpablovasquez50-gif/CLICLOK-FINAL`  
Rama auditada: `click-ok-produccion`  
Proyecto Supabase: `CLICKOK`

## Alcance

Revisión estática de los archivos de la rama y consultas de solo lectura al esquema PostgreSQL, políticas RLS, privilegios y migraciones aplicadas. No se modificó código de aplicación, no se aplicaron cambios de esquema en esta auditoría y no se tocó `main`.

## Hallazgos confirmados

### 1. Núcleo de identidad y multiempresa

- Existen `businesses`, `memberships` y `profiles`.
- La relación de membresía es por `business_id + user_id`, admite varios negocios por usuario y tiene rol y estado activo.
- `is_business_member` y `has_business_role` verifican membresía activa y rol en PostgreSQL.
- `create_business` crea el negocio y la membresía `owner` dentro de una función transaccional.
- El endpoint de listado obtiene primero las membresías activas del usuario autenticado y luego consulta únicamente los negocios asociados.
- Las políticas de lectura de negocios y membresías restringen los registros a miembros y, para membresías ajenas, a owner/admin.

**Pendiente:** el frontend `PrivatePage` selecciona siempre `businesses.data?.[0]`. El selector lateral de negocio es solo visual; no cambia el contexto. Se necesita estado explícito de negocio activo, persistencia segura y revalidación de pertenencia al cambiarlo.

### 2. Roles y autorización

- El esquema define roles de negocio y la función `has_business_role`.
- Las políticas de categorías y productos aplican roles para escritura.
- Funciones operativas como `adjust_product_stock` y `advance_order_status` comprueban roles dentro de PostgreSQL.
- El API usa el JWT del usuario y un cliente Supabase asociado a ese token; las operaciones dependen de RLS y de funciones SQL, no de una clave de servicio para saltarse políticas.

**Pendiente:** la interfaz imprime el texto `Propietario` de forma fija. Debe obtener el rol real de la membresía del negocio activo. Además, hay que definir una matriz de permisos por acción y módulo antes de ampliar endpoints.

### 3. Aislamiento y RLS

- Las tablas públicas revisadas tienen RLS habilitada.
- Las tablas operativas están vinculadas a `business_id`; varias relaciones usan claves foráneas compuestas para impedir referencias cruzadas entre negocios.
- Las políticas existentes restringen lectura y escritura de categorías/productos por membresía y rol.
- En tablas de operaciones como `order_items`, `inventory_movements`, `cash_sessions` y `cash_movements`, el acceso directo de usuarios está revocado y la lectura está protegida por RLS; las escrituras deben pasar por funciones autorizadas.

**Pendiente:** ejecutar pruebas negativas con dos usuarios y dos negocios independientes para cada tabla y cada RPC. RLS habilitada por sí sola no certifica aislamiento; deben probarse SELECT, INSERT, UPDATE, DELETE y funciones SECURITY DEFINER.

### 4. Configuración y módulos

- Existen `business_types`, `business_settings`, `module_catalog` y `business_modules`.
- Los sectores iniciales están sembrados y se puede guardar el tipo mediante RPC `set_business_type`.
- `business_modules` no tiene asignaciones de módulos para los negocios existentes al momento de la consulta.
- La tabla de módulos no tiene escritura directa para usuarios de negocio, lo cual evita que un tenant se conceda capacidades por sí mismo.

**Pendiente:** implementar aprovisionamiento idempotente de módulos por sector, entitlements por plan y comprobación de capacidades en UI, API y PostgreSQL. No activar módulos antiguos/incompatibles de forma automática al cambiar el sector sin una política de migración.

### 5. API y frontend

- La API valida JWT mediante `auth.getUser(token)` y realiza consultas con el token del usuario.
- Las operaciones de negocio usan RLS y RPC para acciones sensibles.
- La aplicación todavía asume un solo negocio al escoger el primer resultado del endpoint.
- La etiqueta del rol está fija en el frontend.

**Pendiente:** contexto global `ActiveBusiness`, selector multiempresa, rol real, invalidación de caché al cambiar negocio y pruebas para impedir que queden visibles datos del negocio anterior.

## Riesgos y prioridades

| Prioridad | Trabajo | Motivo |
|---|---|---|
| P0 | Pruebas de aislamiento multi-tenant | Validar que ningún usuario lea o altere datos de otro negocio |
| P0 | Auditoría de RPC SECURITY DEFINER y grants | Evitar escalamiento de privilegios |
| P1 | Selector real de negocio activo | Soportar usuarios miembros de varios negocios |
| P1 | Rol dinámico y matriz de permisos | Evitar etiquetas y permisos ficticios en la UI |
| P1 | Motor de módulos y asignaciones | Control central de capacidades por sector/plan |
| P2 | Superadministrador aislado | Administración de plataforma separada de tenants |

## Secuencia técnica recomendada

1. Crear pruebas automatizadas de aislamiento para dos negocios de prueba y usuarios con distintos roles.
2. Revisar todas las funciones SECURITY DEFINER, sus grants y su validación de tenant/rol.
3. Implementar el contexto de negocio activo en frontend y API; eliminar la selección fija `data?.[0]`.
4. Exponer el rol real de la membresía en el contrato de API y mostrarlo dinámicamente.
5. Definir matriz de permisos por acción y módulo.
6. Implementar el aprovisionamiento idempotente de módulos por sector y su validación en servidor/base de datos.

## Límites de esta auditoría

Esta es una auditoría inicial de código y esquema, no una certificación de producción. No se ejecutaron pruebas de penetración, pruebas automatizadas de aislamiento ni un análisis exhaustivo de cada endpoint y cada función SQL. Los hallazgos marcados como pendientes requieren esas verificaciones antes de declarar el núcleo SaaS terminado.

## Conservación

Mantener el repositorio, Supabase y servicios actuales. No tocar `main`, no recrear la base de datos, no borrar migraciones y preferir migraciones incrementales revisadas y probadas en staging.
