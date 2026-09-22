import pg from "pg";

const { Pool } = pg;

/**
 * A report as returned by the metadata list query. Image and thumbnail bytes
 * are deliberately NOT part of this shape: the reports list must stay cheap,
 * so it selects metadata only and the frontend fetches the bytes through
 * `/api/reports/:id/image` and `/api/reports/:id/thumbnail`.
 */
export interface ReportRow {
  id: string;
  created_at: Date;
  lat: number | null;
  lon: number | null;
  geo_desc: string | null;
  description: string;
}

/** Payload for a new report (the compressed photo + optional thumbnail). */
export interface NewReport {
  lat: number | null;
  lon: number | null;
  geoDesc: string;
  description: string;
  image: Buffer;
  thumbnail: Buffer | null;
}

const connectionString =
  process.env.DATABASE_URL ??
  "postgres://civil42:civil42@db:5432/civil42";

const pool = new Pool({
  connectionString,
  max: 10,
  connectionTimeoutMillis: 5000,
});

export async function ping(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

export async function insertReport(input: NewReport): Promise<ReportRow> {
  const result = await pool.query(
    `INSERT INTO reports (lat, lon, geo_desc, description, image, thumbnail)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, created_at, lat, lon, geo_desc, description`,
    [
      input.lat,
      input.lon,
      input.geoDesc,
      input.description,
      input.image,
      input.thumbnail,
    ]
  );
  return result.rows[0] as ReportRow;
}

export async function listReports(limit: number): Promise<ReportRow[]> {
  const result = await pool.query(
    `SELECT id, created_at, lat, lon, geo_desc, description
     FROM reports
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

export async function getReportImage(id: string): Promise<Buffer | null> {
  const result = await pool.query(
    `SELECT image FROM reports WHERE id = $1`,
    [id]
  );
  return result.rows.length > 0
    ? (result.rows[0].image as Buffer | null)
    : null;
}

export async function getReportThumbnail(id: string): Promise<Buffer | null> {
  const result = await pool.query(
    `SELECT thumbnail FROM reports WHERE id = $1`,
    [id]
  );
  return result.rows.length > 0
    ? (result.rows[0].thumbnail as Buffer | null)
    : null;
}
