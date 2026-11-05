# CLICK OK — API operativa

Base path: `/api/click-ok`

Todas las rutas requieren `Authorization: Bearer <supabase-access-token>`.
Los identificadores deben ser UUID válidos. La autorización final la aplican las funciones SQL y las políticas RLS; no confiar únicamente en la validación del cliente.

## Inventario

- `PATCH /products/:productId/inventory`
  - JSON: `{"trackInventory":true,"initialStock":12,"lowStockThreshold":3}`
  - Habilita/deshabilita seguimiento y registra el saldo inicial en el libro de movimientos. Solo owner/admin/inventory.
- `GET /businesses/:businessId/inventory-movements?limit=50`
  - Devuelve los últimos movimientos del negocio (límite máximo 100).
- `POST /products/:productId/inventory-movements`
  - JSON: `{"movementType":"in|out|adjustment","quantity":1,"note":"opcional","referenceType":"manual|purchase|sale|return|correction"}`
  - Llama a `adjust_product_stock`, que bloquea el producto durante la actualización, valida el rol y evita existencias negativas.
  - Para `adjustment`, quantity representa el nuevo saldo absoluto.

## Caja

- `GET /businesses/:businessId/cash-sessions?limit=30`
  - Devuelve las sesiones recientes (máximo 100).
- `POST /businesses/:businessId/cash-sessions`
  - JSON: `{"openingAmountCop":0,"notes":"opcional"}`
  - Solo permite una caja abierta por negocio.
- `POST /cash-sessions/:sessionId/movements`
  - JSON: `{"movementType":"sale|income|expense|refund","amountCop":1000,"description":"Descripción","referenceId":null}`
  - Requiere sesión abierta y rol autorizado.
- `POST /cash-sessions/:sessionId/close`
  - JSON: `{"closingAmountCop":1000,"notes":"opcional"}`
  - Calcula el valor esperado y la diferencia de caja dentro de una operación transaccional.

## Requisitos de despliegue y verificación

1. Aplicar primero la migración base `202611050001_click_ok_core.sql` y luego `202611050002_click_ok_operations.sql` en un proyecto Supabase de staging.
2. Configurar `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `CORS_ORIGINS` en el servidor; configurar las variables públicas Vite en el frontend.
3. Verificar que un usuario sin membresía no pueda consultar datos de otro negocio.
4. Probar roles owner/admin/inventory para inventario y owner/admin/cashier para caja.
5. Probar falta de stock, dos aperturas simultáneas de caja, movimientos sobre caja cerrada y cierres con diferencias.
6. Ejecutar typecheck, build y pruebas de integración antes de publicar.

No desplegar esta migración directamente en producción sin copia de seguridad y validación en staging. La integración de estos endpoints no significa que ya exista una pantalla de inventario/caja conectada en el frontend.
