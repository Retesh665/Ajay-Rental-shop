import { handleAuthCheck } from '../../server/r2-vercel-shared.mjs';
export default async function handler(req,res){return handleAuthCheck(req,res);}
