'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { customersService } from '@/services/customers.service';
import {
  Customer,
  CreateCustomerPayload,
  TaxCondition,
  CustomerType,
} from '@/types/customers.types';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);

  // Estados de Modales
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );

  // Formulario
  const [formData, setFormData] = useState<CreateCustomerPayload>({
    customerNumber: '',
    cuit: '',
    name: '',
    legalName: '',
    email: '',
    phone: '',
    contactPerson: '',
    type: CustomerType.RETAILER,
    taxCondition: TaxCondition.RESPONSABLE_INSCRIPTO,
    logisticsFee: 0,
    isActive: true,
    addresses: [
      {
        address: '',
        city: '',
        province: '',
        zipCode: '',
        businessHours: '08:00 - 17:00',
        isDefault: true,
      },
    ],
  });

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await customersService.getAll({ search, page, limit: 8 });
      setCustomers(data.items);
      setTotalPages(data.meta.totalPages);
    } catch (err: any) {
      setError(
        err?.response?.data?.message || 'Error al cargar la lista de clientes',
      );
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const handleOpenModal = (customer?: Customer) => {
    if (customer) {
      setSelectedCustomer(customer);
      setFormData({
        customerNumber: customer.customerNumber,
        cuit: customer.cuit,
        name: customer.name,
        legalName: customer.legalName,
        email: customer.email,
        phone: customer.phone || '',
        contactPerson: customer.contactPerson || '',
        type: customer.type,
        taxCondition: customer.taxCondition,
        logisticsFee: Number(customer.logisticsFee),
        isActive: customer.isActive,
        addresses:
          customer.addresses.length > 0
            ? customer.addresses
            : [
                {
                  address: '',
                  city: '',
                  province: '',
                  zipCode: '',
                  businessHours: '',
                  isDefault: true,
                },
              ],
      });
    } else {
      setSelectedCustomer(null);
      setFormData({
        customerNumber: `CLI-${Math.floor(1000 + Math.random() * 9000)}`,
        cuit: '',
        name: '',
        legalName: '',
        email: '',
        phone: '',
        contactPerson: '',
        type: CustomerType.RETAILER,
        taxCondition: TaxCondition.RESPONSABLE_INSCRIPTO,
        logisticsFee: 0,
        isActive: true,
        addresses: [
          {
            address: '',
            city: '',
            province: '',
            zipCode: '',
            businessHours: '08:00 - 17:00',
            isDefault: true,
          },
        ],
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (selectedCustomer) {
        await customersService.update(selectedCustomer.id, formData);
      } else {
        await customersService.create(formData);
      }
      setIsModalOpen(false);
      fetchCustomers();
    } catch (err: any) {
      alert(
        err?.response?.data?.message ||
          'Ocurrió un error al guardar la información',
      );
    }
  };

  const handleToggleStatus = async (customer: Customer) => {
    if (
      confirm(`¿Está seguro de cambiar el estado del cliente ${customer.name}?`)
    ) {
      try {
        await customersService.update(customer.id, {
          isActive: !customer.isActive,
        });
        fetchCustomers();
      } catch (err: any) {
        alert('Error al modificar el estado');
      }
    }
  };

  return (
    <div className="p-6 bg-slate-950 min-h-screen text-slate-100">
      {/* HEADER PRINCIPAL */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Módulo de Clientes
          </h1>
          <p className="text-sm text-slate-400">
            Administración de cuentas, direcciones de entrega y datos fiscales
            del WMS.
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <span>+ Nuevo Cliente</span>
        </button>
      </div>

      {/* FILTROS Y BÚSQUEDA */}
      <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 mb-6 flex flex-col md:flex-row items-center gap-4">
        <input
          type="text"
          placeholder="Buscar por Nombre, CUIT, Código o Email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
        />
      </div>

      {/* TABLA DE CLIENTES */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400">
            Cargando datos de clientes...
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-500">{error}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="p-4">CÓDIGO</th>
                  <th className="p-4">RAZÓN SOCIAL / NOMBRE</th>
                  <th className="p-4">CUIT</th>
                  <th className="p-4">CONTACTO</th>
                  <th className="p-4">TIPO / TARIFA</th>
                  <th className="p-4">ESTADO</th>
                  <th className="p-4 text-right">ACCIONES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {customers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-500">
                      No se encontraron clientes registrados.
                    </td>
                  </tr>
                ) : (
                  customers.map((c) => (
                    <tr
                      key={c.id}
                      className="hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="p-4 font-mono text-amber-400 font-medium">
                        {c.customerNumber}
                      </td>
                      <td className="p-4">
                        <div className="font-semibold text-white">{c.name}</div>
                        <div className="text-xs text-slate-500">
                          {c.legalName}
                        </div>
                      </td>
                      <td className="p-4 font-mono">{c.cuit}</td>
                      <td className="p-4">
                        <div>{c.email}</div>
                        <div className="text-xs text-slate-500">
                          {c.phone || 'Sin tel.'}
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="text-xs bg-slate-800 border border-slate-700 px-2 py-1 rounded text-slate-300">
                          {c.type}
                        </span>
                        <div className="text-xs text-amber-500 mt-1">
                          ${Number(c.logisticsFee).toFixed(2)}
                        </div>
                      </td>
                      <td className="p-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            c.isActive
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {c.isActive ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="p-4 text-right space-x-2">
                        <button
                          onClick={() => handleOpenModal(c)}
                          className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded transition-colors"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleToggleStatus(c)}
                          className={`text-xs px-3 py-1.5 rounded transition-colors ${
                            c.isActive
                              ? 'bg-rose-950/40 hover:bg-rose-900/60 text-rose-400'
                              : 'bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400'
                          }`}
                        >
                          {c.isActive ? 'Baja' : 'Alta'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* PAGINACIÓN */}
        <div className="bg-slate-950 p-4 border-t border-slate-800 flex justify-between items-center text-xs text-slate-400">
          <span>
            Página {page} de {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200"
            >
              Anterior
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>

      {/* MODAL CREAR / EDITAR */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl">
            <div className="bg-slate-950 p-4 border-b border-slate-800 flex justify-between items-center">
              <h2 className="text-lg font-bold text-white">
                {selectedCustomer
                  ? 'Editar Cliente'
                  : 'Registrar Nuevo Cliente'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="p-6 space-y-4 max-h-[80vh] overflow-y-auto"
            >
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Código Cliente
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.customerNumber}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        customerNumber: e.target.value,
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    CUIT (XX-XXXXXXXX-X)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="20-12345678-9"
                    value={formData.cuit}
                    onChange={(e) =>
                      setFormData({ ...formData, cuit: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Nombre Comercial
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Razón Social
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.legalName}
                    onChange={(e) =>
                      setFormData({ ...formData, legalName: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Email Corporativo
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Teléfono
                  </label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData({ ...formData, phone: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="border-t border-slate-800 pt-4 mt-2">
                <h3 className="text-sm font-semibold text-amber-400 mb-2">
                  Dirección Principal de Entrega
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs text-slate-400 mb-1">
                      Calle y Altura
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.addresses[0]?.address || ''}
                      onChange={(e) => {
                        const newAddresses = [...formData.addresses];
                        newAddresses[0].address = e.target.value;
                        setFormData({ ...formData, addresses: newAddresses });
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Ciudad / Localidad
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.addresses[0]?.city || ''}
                      onChange={(e) => {
                        const newAddresses = [...formData.addresses];
                        newAddresses[0].city = e.target.value;
                        setFormData({ ...formData, addresses: newAddresses });
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Provincia
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.addresses[0]?.province || ''}
                      onChange={(e) => {
                        const newAddresses = [...formData.addresses];
                        newAddresses[0].province = e.target.value;
                        setFormData({ ...formData, addresses: newAddresses });
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-800 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-semibold"
                >
                  {selectedCustomer ? 'Actualizar Cliente' : 'Guardar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
