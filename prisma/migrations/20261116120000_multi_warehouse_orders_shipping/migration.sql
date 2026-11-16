-- Pedidos multi-depósito: el depósito sale de cada tarea de picking.
ALTER TABLE "orders" ALTER COLUMN "source_warehouse_id" DROP NOT NULL;

-- Tipo de envío (Transporte DSH / Expreso) y fecha estimada de entrega.
CREATE TYPE "ShippingType" AS ENUM ('DSH_TRANSPORT', 'EXPRESO');

ALTER TABLE "orders"
  ADD COLUMN "shipping_type" "ShippingType" NOT NULL DEFAULT 'DSH_TRANSPORT',
  ADD COLUMN "estimated_delivery_date" DATE;

-- Pedidos históricos con transporte externo cargado: eran envíos por expreso.
UPDATE "orders" SET "shipping_type" = 'EXPRESO' WHERE "transport_id" IS NOT NULL;
