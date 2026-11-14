-- AlterTable
ALTER TABLE "locations" ADD COLUMN     "height_m" DECIMAL(6,3),
ADD COLUMN     "length_m" DECIMAL(6,3),
ADD COLUMN     "width_m" DECIMAL(6,3);

-- Medidas físicas razonables: (0, 20] metros cada una
ALTER TABLE "locations"
  ADD CONSTRAINT "locations_dimensions_range" CHECK (
    (length_m IS NULL OR (length_m > 0 AND length_m <= 20))
    AND (width_m IS NULL OR (width_m > 0 AND width_m <= 20))
    AND (height_m IS NULL OR (height_m > 0 AND height_m <= 20))
  );
