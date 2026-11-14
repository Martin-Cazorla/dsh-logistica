// dsh-logistica/src/sales-zones/sales-zones.seed-data.ts

/**
 * Zonas comerciales iniciales de Buenos Aires.
 *
 * - CABA: toda la ciudad es una única zona (cualquier barrio).
 * - Norte / Oeste / Sur: los 24 partidos del conurbano según la división
 *   habitual del GBA, más los partidos de la segunda corona que suelen
 *   operarse con su zona (Escobar y Pilar → Norte; Gral. Rodríguez y Marcos
 *   Paz → Oeste; Pte. Perón y San Vicente → Sur). Se cargan el nombre del
 *   partido y sus localidades principales, porque en las direcciones suele
 *   escribirse la localidad (Olivos, Banfield, Ramos Mejía…).
 * - Interior: ciudades principales del resto de la provincia. Una localidad
 *   bonaerense que no figure en ninguna lista queda "Sin zona asignada" y se
 *   asigna desde la pantalla de zonas.
 */
export interface SeedZone {
  name: string;
  province: string;
  sortOrder: number;
  /** Provincia (sin normalizar) con la que se guardan sus localidades. */
  localityProvince: string;
  localities: string[];
}

export const SALES_ZONES_SEED: SeedZone[] = [
  {
    name: 'CABA',
    province: 'Buenos Aires',
    sortOrder: 1,
    localityProvince: 'CABA',
    localities: ['CABA'],
  },
  {
    name: 'Zona Norte',
    province: 'Buenos Aires',
    sortOrder: 2,
    localityProvince: 'Buenos Aires',
    localities: [
      // Vicente López
      'Vicente López', 'Olivos', 'Florida', 'Florida Oeste', 'Munro',
      'Carapachay', 'Villa Martelli', 'La Lucila',
      // San Isidro
      'San Isidro', 'Martínez', 'Acassuso', 'Beccar', 'Boulogne',
      'Boulogne Sur Mer', 'Villa Adelina',
      // San Fernando
      'San Fernando', 'Victoria', 'Virreyes',
      // Tigre
      'Tigre', 'Don Torcuato', 'General Pacheco', 'El Talar', 'Benavídez',
      'Rincón de Milberg', 'Nordelta', 'Troncos del Talar', 'Ricardo Rojas',
      // General San Martín
      'General San Martín', 'Gral. San Martín', 'San Martín',
      'Villa Ballester', 'San Andrés', 'José León Suárez', 'Villa Lynch',
      'Billinghurst', 'Villa Maipú',
      // San Miguel
      'San Miguel', 'Bella Vista', 'Muñiz',
      // Malvinas Argentinas
      'Malvinas Argentinas', 'Los Polvorines', 'Grand Bourg', 'Pablo Nogués',
      'Ingeniero Pablo Nogués', 'Tortuguitas',
      // José C. Paz
      'José C. Paz', 'José C Paz',
      // Segunda corona
      'Escobar', 'Belén de Escobar', 'Garín', 'Ingeniero Maschwitz',
      'Pilar', 'Del Viso', 'Villa Rosa', 'Presidente Derqui', 'Derqui',
    ],
  },
  {
    name: 'Zona Oeste',
    province: 'Buenos Aires',
    sortOrder: 3,
    localityProvince: 'Buenos Aires',
    localities: [
      // Tres de Febrero
      'Tres de Febrero', '3 de Febrero', 'Caseros', 'Ciudad Jardín',
      'Ciudad Jardín Lomas del Palomar', 'Santos Lugares', 'Sáenz Peña',
      'Villa Bosch', 'Martín Coronado', 'Ciudadela', 'Loma Hermosa',
      // Hurlingham
      'Hurlingham', 'William Morris', 'Villa Tesei',
      // Ituzaingó
      'Ituzaingó',
      // Morón
      'Morón', 'Castelar', 'Haedo', 'El Palomar', 'Palomar',
      'Villa Sarmiento',
      // La Matanza
      'La Matanza', 'San Justo', 'Ramos Mejía', 'Lomas del Mirador',
      'Villa Luzuriaga', 'Isidro Casanova', 'González Catán',
      'Gregorio de Laferrere', 'Laferrere', 'Tapiales', 'Villa Madero',
      'Aldo Bonzi', 'Ciudad Evita', 'Rafael Castillo', 'Virrey del Pino',
      '20 de Junio',
      // Merlo
      'Merlo', 'Libertad', 'San Antonio de Padua', 'Padua',
      'Parque San Martín',
      // Moreno
      'Moreno', 'Paso del Rey', 'Francisco Álvarez', 'La Reja', 'Trujui',
      // Segunda corona
      'General Rodríguez', 'Gral. Rodríguez', 'Marcos Paz',
    ],
  },
  {
    name: 'Zona Sur',
    province: 'Buenos Aires',
    sortOrder: 4,
    localityProvince: 'Buenos Aires',
    localities: [
      // Avellaneda
      'Avellaneda', 'Sarandí', 'Wilde', 'Dock Sud', 'Gerli',
      'Villa Domínico', 'Piñeyro',
      // Lanús
      'Lanús', 'Lanús Este', 'Lanús Oeste', 'Remedios de Escalada',
      'Valentín Alsina', 'Monte Chingolo',
      // Lomas de Zamora
      'Lomas de Zamora', 'Banfield', 'Temperley', 'Turdera', 'Llavallol',
      'Villa Fiorito', 'Ingeniero Budge', 'Villa Centenario',
      // Quilmes
      'Quilmes', 'Bernal', 'Don Bosco', 'Ezpeleta', 'San Francisco Solano',
      // Berazategui
      'Berazategui', 'Hudson', 'Ranelagh', 'Sourigues', 'Plátanos',
      // Florencio Varela
      'Florencio Varela', 'Bosques', 'Zeballos',
      // Almirante Brown
      'Almirante Brown', 'Adrogué', 'Burzaco', 'Longchamps',
      'Rafael Calzada', 'José Mármol', 'Claypole', 'Glew',
      'Ministro Rivadavia',
      // Esteban Echeverría
      'Esteban Echeverría', 'Monte Grande', 'Luis Guillón', 'El Jagüel',
      '9 de Abril',
      // Ezeiza
      'Ezeiza', 'Tristán Suárez', 'Canning', 'La Unión',
      // Segunda corona
      'Presidente Perón', 'Guernica', 'San Vicente',
    ],
  },
  {
    name: 'Interior de Buenos Aires',
    province: 'Buenos Aires',
    sortOrder: 5,
    localityProvince: 'Buenos Aires',
    localities: [
      'La Plata', 'City Bell', 'Gonnet', 'Manuel B. Gonnet', 'Tolosa',
      'Berisso', 'Ensenada', 'Mar del Plata', 'General Pueyrredón',
      'Bahía Blanca', 'Tandil', 'Olavarría', 'Azul', 'Junín', 'Pergamino',
      'San Nicolás', 'San Nicolás de los Arroyos', 'Zárate', 'Campana',
      'Luján', 'Mercedes', 'Chivilcoy', 'Chascomús', 'Necochea',
      'Tres Arroyos', 'Trenque Lauquen', 'Nueve de Julio', '9 de Julio',
      'Bragado', 'Pehuajó', 'Balcarce', 'Villa Gesell', 'Pinamar',
      'San Pedro', 'Lobos', 'Cañuelas', 'Brandsen', 'Coronel Brandsen',
      'Coronel Suárez', 'Saladillo', '25 de Mayo', 'Bolívar',
    ],
  },
];
