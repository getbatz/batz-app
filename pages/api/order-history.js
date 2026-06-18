import { supabase } from '../../lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const telegramId = req.query.telegram_id;
  if (!telegramId) {
    return res.status(400).json({ error: 'Missing telegram_id' });
  }

  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('telegram_id', Number(telegramId))
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      throw error;
    }

    res.status(200).json({ orders: data });
  } catch (error) {
    console.error('Order history error', error);
    res.status(500).json({ error: 'Failed to load history' });
  }
}
