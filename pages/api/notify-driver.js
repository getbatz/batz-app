import { CONFIG } from '../../lib/config';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { order } = req.body;
  const driverChatId = CONFIG.TELEGRAM_DRIVER_CHAT_ID;

  if (!order || !driverChatId) {
    return res.status(400).json({ error: 'Missing order or driver_chat_id configuration' });
  }

  if (!CONFIG.TELEGRAM_BOT_TOKEN) {
    return res.status(500).json({ error: 'Telegram bot token not configured' });
  }

  const message = `Новый заказ BATZ:\n` +
    `От: ${order.from_address}\n` +
    `Куда: ${order.to_address}\n` +
    `Тариф: ${order.tariff}\n` +
    `Оплата: ${order.payment}${order.cash_amount ? `, сдача с ${order.cash_amount}` : ''}\n` +
    `Цена: ${order.price} ₸\n` +
    `Расстояние: ${order.distance_km} км\n` +
    `ETA: ${order.eta_minutes} мин`;

  try {
    const response = await fetch(`https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: driverChatId, text: message }),
    });

    const data = await response.json();
    if (!data.ok) {
      return res.status(500).json({ error: 'Telegram API failure', details: data });
    }

    return res.status(200).json({ success: true, result: data.result });
  } catch (error) {
    console.error('Telegram notify error', error);
    return res.status(500).json({ error: 'Unable to send Telegram notification', details: error.message });
  }
}
