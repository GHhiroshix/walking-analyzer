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

    // ④ 画像の枚数・サイズをチェックする
    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: 'リクエストの形式が正しくありません' });
    }

    let imageCount = 0;
    let totalBase64Length = 0;

    for (const msg of messages) {
      if (!Array.isArray(msg.content)) continue;
      for (const block of msg.content) {
        if (block.type === 'image' && block.source && block.source.data) {
          imageCount++;
          const len = block.source.data.length;
          totalBase64Length += len;
          // 1枚あたり約8MB（Base64換算）を超えたら拒否
          if (len > 8 * 1024 * 1024) {
            return res.status(413).json({ error: '画像サイズが大きすぎます' });
          }
        }
      }
    }

    // 枚数が多すぎる場合（通常は6枚程度なので、余裕を見て20枚まで）
    if (imageCount > 20) {
      return res.status(413).json({ error: '画像の枚数が多すぎます' });
    }

    // 全体のデータサイズが大きすぎる場合（約40MB相当）
    if (totalBase64Length > 40 * 1024 * 1024) {
      return res.status(413).json({ error: '送信データが大きすぎます' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
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
