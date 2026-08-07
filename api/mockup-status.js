import { getMockupTask } from '../server/printful.js';

export default async function handler(req, res){
  if(req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if(!process.env.PRINTFUL_API_KEY){
    return res.status(500).json({ error: 'PRINTFUL_API_KEY is not set on the server.' });
  }

  const { taskKey } = req.query;
  if(!taskKey) return res.status(400).json({ error: 'Missing taskKey.' });

  try{
    const result = await getMockupTask(taskKey);
    res.status(200).json(result);
  }catch(err){
    res.status(502).json({ error: err.message });
  }
}
