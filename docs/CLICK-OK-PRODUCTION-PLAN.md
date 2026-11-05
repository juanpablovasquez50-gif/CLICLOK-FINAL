# CLICK OK — plan de implementación de producción

Rama de trabajo: `click-ok-produccion`

Este documento registra el orden de implementación. No representa una certificación de producción ni sustituye pruebas de integración.

## Orden de trabajo

1. **Base y seguridad multiempresa**
   - Verificar todas las relaciones con `business_id`.
   - Revisar políticas RLS para lectura y escritura.
   - Verificar permisos por rol en servidor y base de datos.
   - Impedir que un usuario consulte o modifique datos de otro negocio.

2. **Operación**
   - Catálogo público y carrito.
   - Pedidos con detalle de productos, cantidades, precios y estados.
   - Inventario con movimientos auditables y validación de existencias.
   - POS, caja y cierres.
   - Mesas, cocina y domicilios.

3. **Administración SaaS**
   - Superadministrador de Atom Labs.
   - Negocios, miembros, roles y permisos.
   - Planes, suscripciones, pagos y límites por plan.

4. **Calidad y publicación**
   - Typecheck, build y pruebas automatizadas.
   - Pruebas RLS entre dos negocios distintos.
   - Revisión de variables de entorno y CORS.
   - Aplicación de migraciones en un entorno de pruebas antes de producción.
   - Validación de flujos reales antes de declarar el sistema listo.

## Reglas de seguridad

- Nunca incluir la clave `service_role` en el frontend ni en el repositorio.
- Las operaciones sensibles deben validarse en el servidor o mediante funciones SQL con permisos mínimos.
- Toda consulta y mutación de datos operativos debe quedar limitada al negocio autorizado.
- No declarar integración DIAN activa sin proveedor tecnológico, credenciales y pruebas de habilitación correspondientes.
