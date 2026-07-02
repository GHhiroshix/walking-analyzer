import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ① リクエストから「証明書（トークン）」を取り出す
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'ログインが必要です' });
  }

  try {
    // ② Supabaseに接続する準備
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // ③ 証明書が本物か確認する
    const { data: userData, error: userError } = await supabase.auth.getUser(token);

    if (userError || !userData || !userData.user) {
      return res.status(403).json({ error: 'ログイン情報が無効です。再度ログインしてください。' });
    }

    // ここまで来たら「本人確認OK」
    const { messages } = req.body;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-latest',
        max_tokens: 16000,
        temperature: 0,
        messages,
      }),
    });

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
