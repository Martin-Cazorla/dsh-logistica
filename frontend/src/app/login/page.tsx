'use client';

import React, { useState, FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';

export default function LoginPage() {
  const { login, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!email || !password) {
      setErrorMessage('Por favor ingrese usuario y contraseña');
      return;
    }

    try {
      await login({ email, password });
    } catch (err: any) {
      if (err.response && err.response.data && err.response.data.message) {
        setErrorMessage(
          Array.isArray(err.response.data.message)
            ? err.response.data.message.join(', ')
            : err.response.data.message,
        );
      } else {
        setErrorMessage(
          'Credenciales inválidas o falla de conexión con el servidor.',
        );
      }
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center items-center bg-slate-900 px-4 py-8 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-6 bg-slate-800 p-6 sm:p-8 rounded-xl shadow-2xl border border-slate-700">
        {/* Encabezado e Identificación de Empresa */}
        <div className="text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            DSH Logística
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Sistema de gestión de operaciones logísticas. Ingrese sus
            credenciales para continuar.
          </p>
        </div>

        {/* Mensajes de Error */}
        {errorMessage && (
          <div className="rounded-md bg-red-900/50 border border-red-500 p-4 text-sm text-red-200">
            <p className="font-semibold">Error de Autenticación</p>
            <p>{errorMessage}</p>
          </div>
        )}

        {/* Formulario Táctil Adaptado a Colectoras */}
        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-200"
            >
              Correo Electrónico / Usuario
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-600 bg-slate-700 px-4 py-3 text-white placeholder-slate-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
              placeholder="operario@mail.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-200"
            >
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-600 bg-slate-700 px-4 py-3 text-white placeholder-slate-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center items-center rounded-lg bg-blue-600 px-4 py-3 text-base font-bold text-white shadow-md hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 transition-colors duration-200"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <svg
                  className="animate-spin h-5 w-5 text-white"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  ></path>
                </svg>
                Ingresando...
              </span>
            ) : (
              'INICIAR SESIÓN'
            )}
          </button>
        </form>

        <div className="border-t border-slate-700 pt-4 text-center">
          <p className="text-xs text-slate-500">
            Soporte Operativo Depósito • Perfiles: Admin, Manager, Picker,
            Driver
          </p>
        </div>
      </div>
    </div>
  );
}
