import { Test, TestingModule } from '@nestjs/testing';
import { InventoryService } from './inventory.service';
import { InventoryGateway } from './inventory.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('InventoryService', () => {
  let service: InventoryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        // Dobles de prueba: el test verifica la construcción del servicio sin
        // abrir conexiones reales a la base ni sockets.
        { provide: PrismaService, useValue: {} },
        {
          provide: InventoryGateway,
          useValue: { emitOccupancyChanged: jest.fn() },
        },
        {
          provide: AuditService,
          useValue: { log: jest.fn(), logMany: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
