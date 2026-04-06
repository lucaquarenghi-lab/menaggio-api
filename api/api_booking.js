export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { name, email, preferredDate, propertyType, budget } = req.body;

  if (!name || !email || !preferredDate || !propertyType || !budget) {
    return res.status(400).json({ error: 'Dati incompleti' });
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Immobiliare Menaggio <onboarding@resend.dev>',
        to: ['info@immobiliaremenaggio.com'],
        reply_to: email,
        subject: `📅 Nuova Prenotazione Appuntamento`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
            <div style="background:#1A2A3A;padding:20px;border-radius:8px 8px 0 0">
              <h2 style="color:#C4A84F;margin:0;font-size:18px">📅 Nuova Prenotazione</h2>
              <p style="color:rgba(255,255,255,0.6);margin:4px 0 0;font-size:13px">Appuntamento da visitatore</p>
            </div>
            <div style="background:#f9f7f3;padding:24px;border:1px solid #e4ddd4;border-radius:0 0 8px 8px">
              <table style="width:100%;border-collapse:collapse">
                <tr><td style="padding:8px 0;border-bottom:1px solid #e4ddd4;color:#666;font-size:13px;width:130px">Nome</td>
                    <td style="padding:8px 0;border-bottom:1px solid #e4ddd4;font-weight:600;font-size:13px">${name}</td></tr>
                <tr><td style="padding:8px 0;border-bottom:1px solid #e4ddd4;color:#666;font-size:13px">Email</td>
                    <td style="padding:8px 0;border-bottom:1px solid #e4ddd4;font-size:13px"><a href="mailto:${email}">${email}</a></td></tr>
                <tr><td style="padding:8px 0;border-bottom:1px solid #e4ddd4;color:#666;font-size:13px">Data Preferita</td>
                    <td style="padding:8px 0;border-bottom:1px solid #e4ddd4;font-size:13px">${preferredDate}</td></tr>
                <tr><td style="padding:8px 0;border-bottom:1px solid #e4ddd4;color:#666;font-size:13px">Tipo Immobile</td>
                    <td style="padding:8px 0;border-bottom:1px solid #e4ddd4;font-size:13px">${propertyType}</td></tr>
                <tr><td style="padding:8px 0;color:#666;font-size:13px">Budget</td>
                    <td style="padding:8px 0;font-size:13px">${budget}</td></tr>
              </table>
            </div>
          </div>
        `
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(err);
    }

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('Booking email error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
