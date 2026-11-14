export enum TaxCondition {
  RESPONSABLE_INSCRIPTO = 'RESPONSABLE_INSCRIPTO',
  MONOTRIBUTO = 'MONOTRIBUTO',
  EXENTO = 'EXENTO',
  CONSUMIDOR_FINAL = 'CONSUMIDOR_FINAL',
}

export enum CustomerType {
  DISTRIBUTOR = 'DISTRIBUTOR',
  RETAILER = 'RETAILER',
  DIRECT_CONSUMER = 'DIRECT_CONSUMER',
  LOGISTICS_PARTNER = 'LOGISTICS_PARTNER',
}

export interface CustomerAddress {
  id?: string;
  customerId?: string;
  alias?: string | null;
  address: string;
  city: string;
  province: string;
  zipCode: string;
  businessHours?: string | null;
  isDefault?: boolean;
  isActive?: boolean;
}

export interface Customer {
  id: string;
  customerNumber: string;
  cuit: string;
  name: string;
  legalName: string;
  email: string;
  phone?: string;
  contactPerson?: string;
  type: CustomerType;
  taxCondition: TaxCondition;
  logisticsFee: number;
  isActive: boolean;
  transportId?: string;
  addresses: CustomerAddress[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomerPayload {
  customerNumber: string;
  cuit: string;
  name: string;
  legalName: string;
  email: string;
  phone?: string;
  contactPerson?: string;
  type?: CustomerType;
  taxCondition?: TaxCondition;
  logisticsFee?: number;
  isActive?: boolean;
  transportId?: string;
  addresses: CustomerAddressInput[];
}

export interface UpdateCustomerPayload extends Partial<CreateCustomerPayload> {}

export interface CustomerPaginatedResponse {
  items: Customer[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/**
 * Dirección tal como se envía al backend. En edición, `id` identifica una
 * dirección existente; sin `id` se crea una nueva.
 */
export interface CustomerAddressInput {
  id?: string;
  alias?: string;
  address: string;
  city: string;
  province: string;
  zipCode: string;
  businessHours?: string;
  isDefault: boolean;
}
