// frontend/src/types/trucks.types.ts

export interface Truck {
  id: string;
  brand: string;
  model: string;
  plate: string;
  capacityM3: number;
  maxLoadKg: number;
  isActive: boolean;
  notes: string | null;
  activeRoute: { id: string; code: string; status: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface TruckPayload {
  brand: string;
  model: string;
  plate: string;
  capacityM3: number;
  maxLoadKg: number;
  notes?: string;
  isActive?: boolean;
}
