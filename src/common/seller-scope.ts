// dsh-logistica/src/common/seller-scope.ts

import { Prisma } from '@prisma/client';
import { isSeller } from '../auth/permissions';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

/**
 * Alcance de datos comerciales para el Vendedor. Fuente única para clientes y
 * pedidos, así las pantallas y la API aplican la misma regla.
 *
 *  - Pedidos: sólo los que tienen sellerId = el Vendedor.
 *  - Clientes: los de su cartera (accountSellerId = él) y los que todavía no
 *    tienen vendedor de cuenta. Nunca los de la cartera de otro vendedor.
 *
 * Para cualquier otro rol el alcance es total ({}).
 */
export function orderScopeFor(
  actor: AuthenticatedUser,
): Prisma.OrderWhereInput {
  return isSeller(actor.role) ? { sellerId: actor.id } : {};
}

export function customerScopeFor(
  actor: AuthenticatedUser,
): Prisma.CustomerWhereInput {
  return isSeller(actor.role)
    ? { OR: [{ accountSellerId: actor.id }, { accountSellerId: null }] }
    : {};
}

/** ¿El Vendedor puede operar con un cliente de esta cartera? */
export function canSellerUseCustomer(
  actor: AuthenticatedUser,
  accountSellerId: string | null,
): boolean {
  return (
    !isSeller(actor.role) ||
    accountSellerId === null ||
    accountSellerId === actor.id
  );
}
