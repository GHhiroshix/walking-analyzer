import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token } = req.query;
  if (!token) {
    return res.status(400).json({ error: 'token is required' });
  }

  try {
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // トークンの検証
    const { data: shareToken, error: tokenError } = await supabase
      .from('share_tokens')
      .select('patient_id')
      .eq('token', token)
      .single();

    if (tokenError || !shareToken) {
      return res.status(404).json({ error: 'リンクが無効です' });
    }

    // 患者情報の取得（最低限の情報のみ）
    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .select('id, name')
      .eq('id', shareToken.patient_id)
      .single();

    if (patientError || !patient) {
      return res.status(404).json({ error: '利用者が見つかりません' });
    }

    // 測定履歴の取得（引き継ぎメモは含めない）
    const { data: analyses, error: analysesError } = await supabase
      .from('gait_analyses')
      .select('id, result_text, analyzed_at')
      .eq('patient_id', shareToken.patient_id)
      .order('analyzed_at', { ascending: false })
      .limit(20);

    if (analysesError) {
      return res.status(500).json({ error: '測定履歴の取得に失敗しました' });
    }

    return res.status(200).json({
      patient: { name: patient.name },
      history: analyses,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
