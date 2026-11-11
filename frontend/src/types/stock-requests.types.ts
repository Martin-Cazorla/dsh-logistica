// frontend/src/types/stock-requests.types.ts

export type StockRequestType = 'COUNT' | 'ADJUSTMENT';
export type StockRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface StockRequest {
  id: string;
  type: StockRequestType;
  status: StockRequestStatus;
  inventoryId: string | null;
  productSku: string;
  productName: string;
  locationCode: string;
  warehouseName: string;
  lotNumber: string;
  systemQty: number;
  countedQty: number;
  quantityDelta: number;
  reason: string;
  requestedBy: string | null;
  requestedById: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
}

export interface CreateStockRequestPayload {
  inventoryId: string;
  type: StockRequestType;
  countedQty?: number;
  quantity?: number;
  reason: string;
}
