import { handleUpload } from "../../server/r2-vercel-shared.mjs";
export const config = { api: { bodyParser: false } };
export default async function handler(req, res) { return handleUpload(req, res); }
