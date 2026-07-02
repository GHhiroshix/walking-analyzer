import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "./supabase.js";


const LIGHT = {
  bg: "linear-gradient(135deg, #f5f0e8 0%, #ede8df 40%, #f0ebe2 70%, #e8e3da 100%)",
  bgSolid: "#f5f0e8",
  surface: "rgba(0,0,0,0.06)",
  panel: "rgba(0,0,0,0.04)",
  border: "#000000",
  borderW: "2.5px",
  accent: "#0a7a5a", accentDim: "#086648", blue: "#1a5fb4",
  amber: "#b06e00", red: "#b52040", text: "#2d2416",
  muted: "rgba(45,36,22,0.50)", mutedLight: "rgba(45,36,22,0.70)",
  font: "'Kosugi Maru', sans-serif",
};

const DARK = {
  bg: "linear-gradient(135deg, #0a0f1e 0%, #0d1a2e 40%, #0a1628 70%, #060d18 100%)",
  bgSolid: "#0a0f1e",
  surface: "rgba(255,255,255,0.06)",
  panel: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.18)",
  borderW: "1px",
  accent: "#39e0b0", accentDim: "#1faa80", blue: "#4da6ff",
  amber: "#f5a623", red: "#ff4d6d", text: "#ddeeff",
  muted: "rgba(255,255,255,0.56)", mutedLight: "rgba(255,255,255,0.74)",
  font: "'Kosugi Maru', sans-serif",
};

const ThemeToggle = ({ toggleTheme, theme }) => (
  <button
    onClick={toggleTheme}
    style={{
      position: "fixed", top: 16, right: 16, zIndex: 100,
      background: "rgba(255,255,255,0.1)",
      border: `1px solid rgba(255,255,255,0.2)`,
      borderRadius: 100, padding: "6px 14px",
      color: theme === "dark" ? "#ddeeff" : "#1a2033",
      fontSize: 13, cursor: "pointer",
      fontFamily: "'Kosugi Maru', sans-serif",
      backdropFilter: "blur(8px)",
    }}
  >
    {theme === "dark" ? "☀️ ライト" : "🌙 ダーク"}
  </button>
);

const GlassOrbs = () => (
  <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,overflow:"hidden"}}>
    <div style={{position:"absolute",width:300,height:300,borderRadius:"50%",background:"radial-gradient(circle, rgba(57,224,176,0.2) 0%, transparent 70%)",top:-80,left:-80,filter:"blur(40px)"}}/>
    <div style={{position:"absolute",width:250,height:250,borderRadius:"50%",background:"radial-gradient(circle, rgba(77,166,255,0.15) 0%, transparent 70%)",bottom:100,right:-60,filter:"blur(35px)"}}/>
    <div style={{position:"absolute",width:200,height:200,borderRadius:"50%",background:"radial-gradient(circle, rgba(192,132,252,0.12) 0%, transparent 70%)",top:"40%",left:10,filter:"blur(30px)"}}/>
  </div>
);

async function getShareToken(patientId) {
  const { data, error } = await supabase.from("share_tokens").select("token").eq("patient_id", patientId).maybeSingle();
  if (error) { console.error(error); return null; }
  return data ? data.token : null;
}
async function createShareToken(patientId, facilityId) {
  const { data, error } = await supabase.from("share_tokens").insert({ patient_id: patientId, facility_id: facilityId }).select("token").single();
  if (error) { console.error(error); return null; }
  return data.token;
}
async function deleteShareToken(patientId) {
  const { error } = await supabase.from("share_tokens").delete().eq("patient_id", patientId);
  if (error) { console.error(error); return false; }
  return true;
}
async function getPatients(facilityId) {
  const { data, error } = await supabase.from("patients").select("id, name, furigana, age_group, created_at").eq("facility_id", facilityId).order("furigana", { ascending: true });
  if (error) { console.error(error); return []; }
  return data || [];
}
async function createPatient(facilityId, name, furigana, ageGroup) {
  const { data, error } = await supabase.from("patients").insert({ facility_id: facilityId, name, furigana, age_group: ageGroup }).select().single();
  if (error) { console.error(error); return null; }
  return data;
}
async function getPatientHistory(patientId) {
  const { data, error } = await supabase.from("gait_analyses").select("id, result_text, analyzed_at").eq("patient_id", patientId).order("analyzed_at", { ascending: false }).limit(20);
  if (error) { console.error(error); return []; }
  return (data || []).map(row => { try { const parsed = JSON.parse(row.result_text); return { ...parsed, date: row.analyzed_at, id: row.id }; } catch { return null; } }).filter(Boolean);
}
async function saveAnalysis(patientId, facilityId, record, fullResult) {
  const resultText = JSON.stringify({ ...record, ...fullResult });
  const { error } = await supabase.from("gait_analyses").insert({ patient_id: patientId, facility_id: facilityId, result_text: resultText });
  if (error) console.error(error);
}
async function deletePatient(patientId) {
  const { error } = await supabase.from("patients").delete().eq("id", patientId);
  if (error) { console.error(error); return false; }
  return true;
}
async function deletePatientHistory(patientId) {
  const { error } = await supabase.from("gait_analyses").delete().eq("patient_id", patientId);
  if (error) { console.error(error); return false; }
  return true;
}
async function deleteSingleHistory(analysisId) {
  const { error } = await supabase.from("gait_analyses").delete().eq("id", analysisId);
  if (error) { console.error(error); return false; }
  return true;
}
async function getFacilitySettings(facilityId) {
  const { data, error } = await supabase.from("facility_settings").select("*").eq("facility_id", facilityId);
  if (error || !data || data.length === 0) return { alert_threshold: 5, no_measurement_days: 30 };
  return data[0];
}

async function upsertFacilitySettings(facilityId, alertThreshold, noMeasurementDays) {
  const { error } = await supabase.from("facility_settings").upsert({ facility_id: facilityId, alert_threshold: alertThreshold, no_measurement_days: noMeasurementDays, updated_at: new Date().toISOString() }, { onConflict: "facility_id" });
  if (error) console.error(error);
}

async function getStaffs(facilityId) {
  const { data, error } = await supabase.from("staffs").select("id, name, email, role, created_at").eq("facility_id", facilityId).order("created_at", { ascending: true });
  if (error) { console.error(error); return []; }
  return data || [];
}

async function createStaff(facilityId, name, email, role) {
  const { data, error } = await supabase.from("staffs").insert({ facility_id: facilityId, name, email, role }).select().single();
  if (error) { console.error(error); return null; }
  return data;
}

async function deleteStaff(staffId) {
  const { error } = await supabase.from("staffs").delete().eq("id", staffId);
  if (error) { console.error(error); return false; }
  return true;
}
async function getPatientNotes(patientId) {
  const { data, error } = await supabase.from("patient_notes").select("*").eq("patient_id", patientId).order("created_at", { ascending: false });
  if (error) { console.error(error); return []; }
  return data || [];
}

async function createPatientNote(patientId, facilityId, authorName, content) {
  const { data, error } = await supabase.from("patient_notes").insert({ patient_id: patientId, facility_id: facilityId, author_name: authorName, content }).select().single();
  if (error) { console.error(error); return null; }
  return data;
}

async function deletePatientNote(noteId) {
  const { error } = await supabase.from("patient_notes").delete().eq("id", noteId);
  if (error) { console.error(error); return false; }
  return true;
}

async function getMyRole(facilityId, email) {
  const { data, error } = await supabase.from("staffs").select("role, facility_id, name").eq("email", email);

  if (error || !data || data.length === 0) return { role: null, facilityId: null, name: null };
  return { role: data[0].role, facilityId: data[0].facility_id, name: data[0].name };
}
async function checkLoginLock(email) {
  const { data, error } = await supabase.from("login_attempts").select("*").eq("email", email);
  if (error || !data || data.length === 0) return { locked: false, remainingSeconds: 0 };
  const record = data[0];
  if (record.locked_until && new Date(record.locked_until) > new Date()) {
    const remainingSeconds = Math.ceil((new Date(record.locked_until) - new Date()) / 1000);
    return { locked: true, remainingSeconds };
  }
  return { locked: false, remainingSeconds: 0 };
}

async function recordLoginFailure(email) {
  const { data } = await supabase.from("login_attempts").select("*").eq("email", email);
  const current = data && data.length > 0 ? data[0].failed_count : 0;
  const newCount = current + 1;
  const lockedUntil = newCount >= 5 ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : null;
  await supabase.from("login_attempts").upsert({ email, failed_count: newCount, locked_until: lockedUntil }, { onConflict: "email" });
  return { newCount, locked: newCount >= 5 };
}

async function resetLoginFailure(email) {
  await supabase.from("login_attempts").upsert({ email, failed_count: 0, locked_until: null }, { onConflict: "email" });
}

function toBase64(canvas) { return canvas.toDataURL("image/jpeg", 0.75).split(",")[1]; }
function formatTime(s) { return `${Math.floor(s/60).toString().padStart(2,"0")}:${Math.floor(s%60).toString().padStart(2,"0")}`; }
function formatDate(iso) { const d = new Date(iso); return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}`; }
// ベビーカー→歩行器 強制置換
function fixTerms(text) {
  if (!text) return text;
  return text.replace(/ベビーカー/g, "シルバーカー");
}

// 印刷用スコアカラー
function printScoreColor(score) {
  return score >= 75 ? "#1a6640" : score >= 50 ? "#b55a00" : "#c0151f";
}

const buildPrompt = (frameCount, history, ageGroup) => {
  const hasHistory = history && history.length > 0;
  const historyBlock = hasHistory
    ? `\n【過去の測定履歴（最新${Math.min(history.length,3)}回）】\n${history.slice(0,3).map((h,i) => `[${i+1}回前 ${formatDate(h.date)}] スコア:${h.score} 課題:${(h.issues||[]).map(x=>x.title).join("・")} 体操:${(h.exercises||[]).map(x=>x.name).join("・")}`).join("\n")}\n前回の体操から進捗を考慮し難易度を上げるか別のアプローチを提案してください。progressフィールドに前回比コメントを記載してください。`
    : `\n初回測定です。基本的な改善体操を提案してください。progressフィールドはnullにしてください。`;
  return `あなたは高齢者介護施設のスタッフと利用者のご家族に説明する立場の理学療法士です。
添付された${frameCount}枚の歩行動画フレーム画像（時系列順）を分析し、歩行動作を評価してください。

【撮影上の注意】
- カメラを横に動かしながら撮影している場合があります。各フレームの瞬間的な姿勢・関節角度・重心を中心に評価し、フレーム間の位置変化は歩行の評価に用いないでください。
- 全身が映っていないフレームは除外し、有効なフレームのみで判断してください。

【補助具・環境の検出】
- 杖（一本杖・四点杖・ロフストランドクラッチなど）、歩行器、シルバーカーなどを検出してください。
- 壁や廊下の手すりも検出してください。
- 補助具・手すりの使い方が適切か（荷重・高さ・グリップ位置）も評価してください。
- 体操提案は補助具の有無・種類に合わせた内容にしてください。
- 映像内で本人が手で押しながら歩いている4輪または3輪の歩行補助具は、見た目がベビーカーに似ていても「歩行器」または「シルバーカー」として判定してください。付き添いの人が押している場合のみベビーカーと判定してください。
${historyBlock}
【年代情報】
${ageGroup ? `この方の年代は「${ageGroup}」です。年代別の標準歩行速度と比較して、忖度せず客観的に評価してください。標準的なら「標準的な速度です」、遅ければ「同年代の標準（毎秒〇m前後）よりやや遅く、フレイル傾向が見られます」のように、年代を踏まえた率直な評価をしてください。` : "年代情報が未登録のため、一般的な高齢者の標準値で評価してください。"}

【歩行速度の推定 — 必ず含めること】
- 動画のフレーム間の時間と歩数・歩幅を画像から判断し、毎秒の歩行速度（m/秒）を具体的な数値で推定してください。
- 推定値は「速度：毎秒○.○m」の形式にしてください。
- 年代別の標準値（参考：60代 毎秒1.0〜1.2m、70代 毎秒0.9〜1.1m、80代 毎秒0.7〜0.9m、90代以上 毎秒0.5〜0.7m、補助具使用時はこれより遅くなるのが通常）と比較し、speedCommentフィールドに客観的な評価を記載してください。お世辞は禁止です。
【スコアの決まり — 必ず守ること】
- scoreは0〜100の整数で返してください。
- 前回のスコアを参考にしてはいけません。毎回独立して客観的に採点してください。
- お世辞や励ましのためにスコアを高くしないでください。事実のみで採点してください。
- 補助具（杖・歩行器・シルバーカーなど）を使用しながらでも安全に歩けている場合は、最低60点以上にしてください。
- 一定のリズムで継続して歩けている場合は、最低70点以上にしてください。
- 補助具なしで安定して歩けている場合は、最低75点以上にしてください。
- 転倒リスクが非常に高い・歩行が著しく不安定な場合のみ60点未満にしてください。

【採点ルーブリック（補助具なし歩行は70点スタート）】
以下の項目で加点・減点してください：
- 歩幅の左右差：ほぼ均等なら+5点、やや差あり±0点、明らかな差があれば-5点
- 体幹の安定性：ふらつきなし+5点、軽度のふらつき±0点、大きなふらつき-5点
- 歩行速度：年齢標準より速い+5点、標準的±0点、明らかに遅い-5点
- つま先の上がり具合：しっかり上がる+5点、やや低い±0点、すり足-5点
- 腕の振り：左右対称+5点、やや非対称±0点、ほとんど振れていない-5点
- 補助具使用の場合は70点スタートではなく60点スタートとし、上記ルーブリックを適用してください。

【言葉づかいの決まり — 必ず守ること】
- 専門用語・医療用語を使わず、高齢者・介護スタッフ・ご家族が読んでもすぐわかる言葉で書いてください。
- 難しい言葉は以下のように言い換えてください：
  「足のクリアランス」→「足の上がり具合」
  「体幹」→「背中やおなかまわりの筋肉」
  「歩行周期」→「歩くリズム」
  「歩隔」→「足を広げる幅」
  「重心移動」→「体の重心の移り方」
  「関節可動域」→「関節の動く範囲」
  「筋力低下」→「足腰の力が弱くなっている」
  「バランス機能」→「バランスをとる力」
  「嚥下」→「飲み込み」
  「廃用症候群」→「動かないことによる体力低下」
- summaryは「〇〇が気になりますが、△△はしっかりできています」のように、ポジティブな面も含めた一言にしてください。
- issuesのdetailは「〜のため、転びやすくなっています」「〜すると、もっと安全に歩けます」など、なぜ大事かを含めた2〜3文で書いてください。
- exercisesのstepsは「①イスに浅く座ります」「②ゆっくり片足を上げます」のように、番号付きで動作を一つずつ、誰でもわかる言葉で書いてください。
- exercisesのeffectは「足の上がりがよくなり、つまずきにくくなります」のように、利用者が実感できる効果を書いてください。
- lifestyleは「毎日の食事のあとに〜すると良いです」など、日常生活に即した具体的なアドバイスにしてください。
- progressは「前回より足の上がりが良くなっています」のように、ご本人やご家族が喜べる言葉で書いてください。

以下のJSON形式のみで回答してください（前置き・後置き・コードブロック記号なし）：
{"score":数値,"summary":"総合評価（25文字以内）","progress":"前回比コメント（初回はnull）","aids":{"detected":[],"usage":null,"recommendation":null},"gait":{"cadence":"","stride":"","posture":"","armSwing":"","footClearance":"","speed":"","speedComment":""},"issues":[{"title":"","detail":"","severity":"high|medium|low"}],"exercises":[{"name":"","target":"","duration":"","steps":[],"effect":"","isNew":true}],"lifestyle":[]}`;
};

// ── 印刷HTML生成（共通関数）──────────────────────────────────────────────────
function buildPrintHTML({ patientName, measureNo, dateStr, result }) {
  const sc = printScoreColor(result.score);
  const scBg = result.score >= 75 ? "#e8f5ee" : result.score >= 50 ? "#fff4e5" : "#fdecea";

  let html = `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8">
<title>歩行解析レポート - ${patientName}</title>
<link href="https://fonts.googleapis.com/css2?family=Kosugi+Maru&display=swap" rel="stylesheet">
<style>
  body { font-family:'Kosugi Maru',sans-serif; color:#1a1a1a; background:#f7f4ef; margin:0; padding:24px; }
  .wrap { max-width:700px; margin:0 auto; }
  h3 { margin:0 0 8px; font-size:20px; color:#1a1a1a; }
  h4 { margin:0 0 10px; font-size:16px; color:#333; }
  .section { background:#fff; border-radius:14px; padding:20px 22px; margin-bottom:16px; border:1px solid #ddd; box-shadow:0 1px 4px rgba(0,0,0,0.06); }
  .label { font-size:11px; color:#888; letter-spacing:2px; font-weight:700; margin-bottom:10px; }
  table { width:100%; border-collapse:collapse; }
  td { padding:10px 8px; border-bottom:1px solid #eee; font-size:14px; }
  td:first-child { color:#555; font-weight:700; width:140px; }
  .issue { padding:12px 16px; border-radius:10px; margin-bottom:10px; border-left:5px solid; }
  .ex { background:#f0faf4; border-radius:10px; padding:14px 16px; margin-bottom:12px; border:1px solid #a7f3d0; }
  .ex-step { font-size:13px; color:#333; margin:4px 0 4px 12px; line-height:1.7; }
  .tip { background:#fffbeb; border-radius:8px; padding:10px 14px; margin-bottom:10px; border:1px solid #fde68a; font-size:14px; line-height:1.7; color:#444; }
  .footer { margin-top:24px; padding-top:14px; border-top:1px solid #ddd; font-size:11px; color:#aaa; text-align:center; }
  @media print { @page { margin:12mm; } body { background:#fff; padding:0; } }
</style></head><body><div class="wrap">`;

  // ヘッダー
  html += `<div style="border-bottom:3px solid ${sc};padding-bottom:14px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-end;">
    <div>
      <div style="font-size:11px;color:#888;letter-spacing:2px;margin-bottom:4px;">VIDEO GAIT ANALYSIS REPORT</div>
      <div style="font-size:26px;font-weight:900;color:#1a1a1a;">${patientName}</div>
    </div>
    <div style="text-align:right;font-size:12px;color:#666;line-height:1.8;">
      <div>${dateStr}</div>
      <div>${measureNo}回目の測定</div>
    </div>
  </div>`;

  // スコアブロック
  html += `<div class="section" style="background:${scBg};border:2px solid ${sc};">
    <div style="display:flex;align-items:center;gap:24px;">
      <div style="text-align:center;min-width:90px;">
        <div style="font-size:64px;font-weight:900;color:${sc};font-family:monospace;line-height:1;">${result.score}</div>
        <div style="font-size:11px;color:#888;letter-spacing:2px;margin-top:2px;">GAIT SCORE</div>
      </div>
      <div style="flex:1;border-left:4px solid ${sc};padding-left:18px;">
        <div style="font-size:18px;font-weight:900;margin-bottom:8px;color:#1a1a1a;">${result.summary}</div>
        ${result.progress ? `<div style="font-size:13px;color:#2c5f8a;padding:10px 12px;background:#e8f0fb;border-radius:8px;border-left:4px solid #3b82f6;line-height:1.7;">💬 ${result.progress}</div>` : ""}
      </div>
    </div>
  </div>`;

  // 補助具
  if (result.aids && result.aids.detected && result.aids.detected.length > 0) {
    html += `<div class="section" style="background:#eef4ff;border:1px solid #93c5fd;">
      <div class="label" style="color:#1d4ed8;">🦯 補助具・手すり</div>
      <div style="font-size:16px;font-weight:700;color:#1e3a5f;margin-bottom:8px;">${result.aids.detected.join("、")}</div>
      ${result.aids.usage ? `<div style="font-size:13px;color:#333;margin-bottom:6px;line-height:1.7;"><b>使い方：</b>${fixTerms(result.aids.usage)}</div>` : ""}
      ${result.aids.recommendation ? `<div style="font-size:13px;color:#333;line-height:1.7;"><b>アドバイス：</b>${fixTerms(result.aids.recommendation)}</div>` : ""}
    </div>`;
  }

  // 歩行速度
  if (result.gait && result.gait.speed) {
    html += `<div class="section" style="background:#f0faf4;border:1px solid #a7f3d0;">
      <div class="label">🚶 歩行速度</div>
      <div style="font-size:32px;font-weight:900;color:#1a6640;font-family:monospace;margin-bottom:8px;">${result.gait.speed}</div>
      ${result.gait.speedComment ? `<div style="font-size:14px;color:#333;line-height:1.7;">${result.gait.speedComment}</div>` : ""}
    </div>`;
  }

  // 歩行指標
  if (result.gait) {
    html += `<div class="section">
      <div class="label">📊 歩行指標</div>
      <table><tbody>
        ${[["歩行リズム",result.gait.cadence],["歩幅",result.gait.stride],["体幹・姿勢",result.gait.posture],["腕振り",result.gait.armSwing],["足のクリアランス",result.gait.footClearance]]
          .map(([l,v])=>`<tr><td>${l}</td><td style="font-weight:700;color:#1a1a1a;">${v}</td></tr>`).join("")}
      </tbody></table>
    </div>`;
  }

  // 課題
  if (result.issues && result.issues.length > 0) {
    html += `<div class="section">
      <div class="label">⚠️ 課題・改善ポイント</div>
      ${result.issues.map(issue => {
        const bc = issue.severity==="high"?"#dc2626":issue.severity==="medium"?"#d97706":"#16a34a";
        const bg = issue.severity==="high"?"#fff5f5":issue.severity==="medium"?"#fffbf0":"#f0fff4";
        return `<div class="issue" style="background:${bg};border-color:${bc};">
          <div style="font-size:15px;font-weight:900;margin-bottom:6px;color:#1a1a1a;">${issue.title}</div>
          <div style="font-size:13px;color:#444;line-height:1.7;">${issue.detail}</div>
        </div>`;
      }).join("")}
    </div>`;
  }

  // 体操
  if (result.exercises && result.exercises.length > 0) {
    html += `<div class="section">
      <div class="label">🏃 体操メニュー</div>
      ${result.exercises.map(ex => `
        <div class="ex">
          <div style="font-size:16px;font-weight:900;color:#065f46;margin-bottom:6px;">${ex.name}
            <span style="font-size:12px;color:#666;font-weight:400;">（${ex.target} ／ ${ex.duration}）</span>
          </div>
          ${ex.steps.map((s,j)=>{
            const st=s||"";
            const icon=st.includes("座")||st.includes("イス")||st.includes("椅子")?"🪑":
                       st.includes("足を上げ")||st.includes("膝を上げ")?"🦵":
                       st.includes("立ち上が")||st.includes("立って")||st.includes("立つ")?"🧍":
                       st.includes("かかと")||st.includes("つま先")?"👣":
                       st.includes("腕")||st.includes("手を")?"🙆":
                       st.includes("深呼吸")||st.includes("息を")||st.includes("呼吸")?"🌬️":
                       st.includes("歩")||st.includes("ウォーク")?"🚶":"▶️";
            return `<div class="ex-step"><span style="font-size:16px;margin-right:6px;">${icon}</span><span style="display:inline-block;min-width:20px;height:20px;border-radius:50%;background:#d1fae5;color:#065f46;font-size:11px;font-weight:800;text-align:center;line-height:20px;margin-right:8px;">${j+1}</span>${s}</div>`;
          }).join("")}
          <div style="font-size:13px;color:#065f46;font-weight:700;margin-top:8px;padding:8px 10px;background:#d1fae5;border-radius:6px;">✓ 効果：${ex.effect}</div>
        </div>`).join("")}
    </div>`;
  }

  // 生活アドバイス
  if (result.lifestyle && result.lifestyle.length > 0) {
    html += `<div class="section">
      <div class="label">💡 生活アドバイス</div>
      ${result.lifestyle.map((tip,i)=>`<div class="tip">${i+1}. ${tip}</div>`).join("")}
    </div>`;
  }

  html += `<div class="footer">本レポートはAI歩行解析の参考情報です。医療診断の代替ではありません。</div>`;
  html += `</div></body></html>`;
  return html;
}

function openPrintWindow(html) {
  const win = window.open("","_blank");
  if (win) { win.document.open(); win.document.write(html); win.document.close(); setTimeout(()=>win.print(), 1500); }

}

function downloadCSV(patientName, history) {
  const headers = ["日付", "スコア", "要約", "歩行速度"];
  const rows = history.map(h => [
    formatDate(h.date),
    h.score,
    (h.summary || "").replace(/"/g, '""'),
    (h.gait && h.gait.speed) ? h.gait.speed : "",
  ]);
  const csvContent = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(",")).join("\r\n");
  const bom = "\uFEFF";
  const blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `歩行解析履歴_${patientName}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
// StaffManager component moved outside to avoid nesting re-creation bugs
const StaffManager = ({
  show,
  onClose,
  theme,
  C,
  alertThreshold,
  setAlertThreshold,
  noMeasurementDays,
  setNoMeasurementDays,
  myRole,
  staffs,
  session,
  loadStaffs
}) => {
  const [localName, setLocalName] = useState("");
  const [localEmail, setLocalEmail] = useState("");
  const [localRole, setLocalRole] = useState("staff");
  if (!show) return null;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:"0 16px"}}>
      <div style={{background:theme==="dark"?"#f5f0e8":"#1a2233",border:`1px solid ${theme==="dark"?"rgba(0,0,0,0.15)":"rgba(255,255,255,0.15)"}`,borderRadius:16,padding:"24px",width:"100%",maxWidth:400,maxHeight:"80vh",overflowY:"auto",color:theme==="dark"?"#2d2416":"#ddeeff",WebkitTextFillColor:theme==="dark"?"#2d2416":"#ddeeff"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div style={{fontWeight:700,fontSize:16,color:C.text}}>👥 スタッフ管理</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:20}}>×</button>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
          <input value={localName} onChange={e=>setLocalName(e.target.value)} placeholder="スタッフ名" style={{background:C.surface,border:`1px solid ${theme==="dark"?"rgba(0,0,0,0.4)":"rgba(255,255,255,0.3)"}`,borderRadius:8,padding:"10px 12px",color:C.text,fontSize:13,fontFamily:C.font,outline:"none",caretColor:theme==="dark"?"#2d2416":"#ddeeff"}}/>
          <input value={localEmail} onChange={e=>setLocalEmail(e.target.value)} placeholder="メールアドレス" type="email" style={{background:C.surface,border:`1px solid ${theme==="dark"?"rgba(0,0,0,0.4)":"rgba(255,255,255,0.3)"}`,borderRadius:8,padding:"10px 12px",color:C.text,fontSize:13,fontFamily:C.font,outline:"none",caretColor:theme==="dark"?"#2d2416":"#ddeeff"}}/>
          <select value={localRole} onChange={e=>setLocalRole(e.target.value)} style={{background:C.surface,border:`1px solid ${theme==="dark"?"rgba(0,0,0,0.4)":"rgba(255,255,255,0.3)"}`,borderRadius:8,padding:"10px 12px",color:C.text,fontSize:13,fontFamily:C.font,outline:"none"}}>
            <option value="staff">スタッフ</option>
            <option value="admin">管理者</option>
          </select>
          <button onClick={async()=>{
            if(!localName.trim()||!localEmail.trim()) return;
            await createStaff(session.user.id, localName.trim(), localEmail.trim(), localRole);
            setLocalName(""); setLocalEmail(""); setLocalRole("staff");
            await loadStaffs(session.user.id);
          }} style={{padding:"10px",background:`linear-gradient(135deg,${C.accent},${C.accentDim})`,border:"none",borderRadius:8,color:C.bgSolid,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:C.font}}>
            ＋ スタッフを追加
          </button>
        </div>
        <div style={{marginBottom:16,padding:"12px 14px",background:theme==="dark"?"rgba(0,0,0,0.08)":"rgba(255,255,255,0.15)",borderRadius:10,border:`1px solid ${theme==="dark"?"rgba(0,0,0,0.2)":"rgba(255,255,255,0.2)"}`}}>
          <div style={{fontSize:11,fontWeight:700,marginBottom:8}}>⚠️ アラート設定</div>
          <div style={{display:"flex",alignItems:"center",gap:8,fontSize:13}}>
            <span>前回より</span>
            <input type="number" min="1" max="50" value={alertThreshold} onChange={e=>setAlertThreshold(Number(e.target.value))} disabled={myRole!=="admin"} style={{width:50,background:"transparent",border:`1px solid ${theme==="dark"?"rgba(0,0,0,0.3)":"rgba(255,255,255,0.3)"}`,borderRadius:6,padding:"4px 8px",color:"inherit",fontSize:13,fontFamily:C.font,textAlign:"center"}}/>
            <span>点以上下がったら赤くアラート</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,fontSize:13,marginTop:8}}>
            <span>測定が</span>
            <input type="number" min="1" max="365" value={noMeasurementDays} onChange={e=>setNoMeasurementDays(Number(e.target.value))} disabled={myRole!=="admin"} style={{width:50,background:"transparent",border:`1px solid ${theme==="dark"?"rgba(0,0,0,0.3)":"rgba(255,255,255,0.3)"}`,borderRadius:6,padding:"4px 8px",color:"inherit",fontSize:13,fontFamily:C.font,textAlign:"center"}}/>
            <span>日以上ないとアラート</span>
          </div>
          {myRole==="admin"&&<button onClick={async()=>{await upsertFacilitySettings(session.user.id, alertThreshold, noMeasurementDays); alert("保存しました！");}} style={{marginTop:10,padding:"7px 14px",background:`linear-gradient(135deg,${C.accent},${C.accentDim})`,border:"none",borderRadius:8,color:C.bgSolid,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:C.font}}>保存</button>}
        </div>
        <div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:10}}>登録済みスタッフ</div>
        {staffs.length===0?(
          <div style={{textAlign:"center",color:C.muted,fontSize:13,padding:"20px"}}>まだ登録されていません</div>
        ):(
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {staffs.map(s=>(
              <div key={s.id} style={{background:C.surface,border:`${C.borderW} solid ${C.border}`,borderRadius:10,padding:"12px 14px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:13,color:C.text}}>{s.name}</div>
                  <div style={{fontSize:11,color:C.muted}}>{s.email}</div>
                  <div style={{fontSize:10,marginTop:2,color:s.role==="admin"?C.amber:C.accent}}>{s.role==="admin"?"👑 管理者":"👤 スタッフ"}</div>
                </div>
                <button onClick={async()=>{
                  if(!window.confirm(`${s.name}を削除しますか？`)) return;
                  await deleteStaff(s.id);
                  await loadStaffs(session.user.id);
                }} style={{background:"transparent",border:`1px solid ${C.red}44`,borderRadius:6,color:C.red,fontSize:11,cursor:"pointer",padding:"5px 10px",fontFamily:C.font}}>削除</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// DeleteDialog component moved outside to avoid nesting re-creation bugs
const DeleteDialog = ({
  confirm,
  onCancel,
  onConfirm,
  C
}) => {
  if (!confirm) return null;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:"0 16px"}}>
      <div style={{background:C.panel,border:`${C.borderW} solid ${C.border}`,borderRadius:16,padding:"24px",width:"100%",maxWidth:340}}>
        <div style={{fontSize:18,marginBottom:12,textAlign:"center"}}>{confirm.type==="patient"?"🗑️":"📋"}</div>
        <div style={{fontWeight:700,fontSize:15,marginBottom:8,textAlign:"center",color:C.text}}>{confirm.type==="patient"?"利用者を削除しますか？":"履歴を削除しますか？"}</div>
        <div style={{fontSize:13,color:C.muted,textAlign:"center",marginBottom:20,lineHeight:1.6}}>
          <span style={{color:C.text,fontWeight:700}}>{confirm.name}</span>
          {confirm.type==="patient"?"さんのデータと全履歴が削除されます。":"さんの解析履歴がすべて削除されます。"}
          <br/>この操作は取り消せません。
        </div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onCancel} style={{flex:1,padding:"11px",background:"transparent",border:`${C.borderW} solid ${C.border}`,borderRadius:10,color:C.muted,fontSize:13,cursor:"pointer",fontFamily:C.font}}>キャンセル</button>
          <button onClick={onConfirm} style={{flex:1,padding:"11px",background:C.red,border:"none",borderRadius:10,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:C.font}}>削除する</button>
        </div>
      </div>
    </div>
  );
};


export default function WalkingVideoAnalyzer() {
const shareMatch = window.location.pathname.match(/^\/share\/(.+)$/);
if (shareMatch) {
  return <SharePage token={shareMatch[1]} />;
}
const getSystemTheme = () => window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
const getSavedTheme = () => localStorage.getItem("theme") || getSystemTheme();
const [theme, setTheme] = useState(getSavedTheme);
const C = theme === "dark" ? DARK : LIGHT;
const toggleTheme = () => {
  const next = theme === "dark" ? "light" : "dark";
  setTheme(next);
  localStorage.setItem("theme", next);
};function ScoreArc({ score }) {
  const size=160, cx=80, cy=80, r=62;
  const angle = -210 + (score/100)*240;
  const toRad = d => (d*Math.PI)/180;
  const arc = (a1,a2,rad) => { const x1=cx+rad*Math.cos(toRad(a1)), y1=cy+rad*Math.sin(toRad(a1)); const x2=cx+rad*Math.cos(toRad(a2)), y2=cy+rad*Math.sin(toRad(a2)); return `M ${x1} ${y1} A ${rad} ${rad} 0 ${a2-a1>180?1:0} 1 ${x2} ${y2}`; };
  const col = score>=75?C.accent:score>=50?C.amber:C.red;
  return (<div style={{position:"relative",width:size,height:size}}><svg width={size} height={size}><path d={arc(-210,30,r)} fill="none" stroke={C.border} strokeWidth={10} strokeLinecap="round"/><path d={arc(-210,angle,r)} fill="none" stroke={col} strokeWidth={10} strokeLinecap="round" style={{transition:"all 1.4s cubic-bezier(.4,0,.2,1)"}}/><circle cx={cx+r*Math.cos(toRad(angle))} cy={cy+r*Math.sin(toRad(angle))} r={6} fill={col} style={{transition:"all 1.4s",filter:`drop-shadow(0 0 6px ${col})`}}/></svg><div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",paddingTop:8}}><span style={{fontSize:42,fontWeight:900,color:col,fontFamily:"'Space Mono',monospace",lineHeight:1}}>{score}</span><span style={{fontSize:10,color:C.muted,letterSpacing:3}}>GAIT SCORE</span></div></div>);
}
function ScoreHistoryChart({ history }) {
  if (!history||history.length<2) return null;
  const items = [...history].reverse().slice(-8);
  const scores = items.map(h=>h.score);
  const minS=Math.max(0,Math.min(...scores)-10), maxS=Math.min(100,Math.max(...scores)+10);
  const cW=280,cH=80,pad=20;
  const pts = items.map((h,i)=>({ x: pad+(i/(items.length-1))*(cW-pad*2), y: cH-pad-((h.score-minS)/(maxS-minS))*(cH-pad*2), score: h.score }));
  const pathD = pts.map((p,i)=>`${i===0?"M":"L"} ${p.x} ${p.y}`).join(" ");
  const areaD = `${pathD} L ${pts[pts.length-1].x} ${cH-pad} L ${pts[0].x} ${cH-pad} Z`;
  return (<div style={{marginTop:12}}><div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:8}}>スコア推移</div><svg width="100%" viewBox={`0 0 ${cW} ${cH}`} style={{overflow:"visible"}}><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.accent} stopOpacity="0.3"/><stop offset="100%" stopColor={C.accent} stopOpacity="0"/></linearGradient></defs><path d={areaD} fill="url(#g)"/><path d={pathD} fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>{pts.map((p,i)=>(<g key={i}><circle cx={p.x} cy={p.y} r={4} fill={C.accent} stroke={C.bgSolid} strokeWidth={2}/><text x={p.x} y={p.y-8} textAnchor="middle" fontSize="10" fill={C.accent} fontFamily="monospace">{p.score}</text>{i===0&&<text x={p.x} y={cH-4} textAnchor="middle" fontSize="8" fill={C.muted}>最古</text>}{i===pts.length-1&&<text x={p.x} y={cH-4} textAnchor="middle" fontSize="8" fill={C.muted}>今回</text>}</g>))}</svg></div>);
}
function GaitMetricsHistoryChart({ history }) {
  if (!history || history.length < 2) return null;
  const items = [...history].reverse().slice(-8);
  const getScore = (v) => {
    if (!v) return 65;
    const s = String(v);
    if (s==="良好"||s==="正常"||s==="自然") return 85;
    if (s.includes("十分")||s.includes("安定")||s.includes("良く")||s.includes("改善")||s.includes("伸び")) return 80;
    if (s.includes("やや")||s.includes("少し")) return 60;
    if (s.includes("不規則")||s.includes("小さい")||s.includes("少ない")||s.includes("擦る")||s.includes("前かがみ")) return 40;
    return 65;
  };
  const metrics = [
    { key:"cadence", label:"歩行リズム", color:"#39e0b0" },
    { key:"stride",  label:"歩幅",       color:"#4da6ff" },
    { key:"posture", label:"体幹・姿勢", color:"#f5a623" },
    { key:"armSwing",label:"腕振り",     color:"#c084fc" },
    { key:"footClearance",label:"足の上がり",color:"#39e0b0" },
  ];
  const cW=280, cH=100, pad=20;
  const validItems = items.filter(h => h.gait);
  if (validItems.length < 2) return null;
  return (
    <div style={{marginTop:16}}>
      <div style={{fontSize:11,color:"rgba(255,255,255,0.35)",letterSpacing:2,marginBottom:10}}>歩行指標の推移</div>
      <svg width="100%" viewBox={`0 0 ${cW} ${cH}`} style={{overflow:"visible"}}>
        <defs>
          {metrics.map((m,i) => (
            <linearGradient key={i} id={`mg${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={m.color} stopOpacity="0.15"/>
              <stop offset="100%" stopColor={m.color} stopOpacity="0"/>
            </linearGradient>
          ))}
        </defs>
        {/* グリッド線 */}
        {[40,60,80].map(v => {
          const y = cH-pad-((v-20)/(100-20))*(cH-pad*2);
          return <line key={v} x1={pad} y1={y} x2={cW-pad} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1"/>;
        })}
        {metrics.map((m, mi) => {
          const pts = validItems.map((h,i) => ({
            x: pad+(i/(validItems.length-1))*(cW-pad*2),
            y: cH-pad-((getScore(h.gait[m.key])-20)/(100-20))*(cH-pad*2),
            score: getScore(h.gait[m.key])
          }));
          const pathD = pts.map((p,i)=>`${i===0?"M":"L"} ${p.x} ${p.y}`).join(" ");
          return (
            <g key={mi}>
              <path d={pathD} fill="none" stroke={m.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.8"/>
              {pts.map((p,i) => (
                <circle key={i} cx={p.x} cy={p.y} r={3} fill={m.color} stroke="rgba(10,15,30,1)" strokeWidth={1.5}/>
              ))}
            </g>
          );
        })}
        {validItems.map((h,i) => {
          const x = pad+(i/(validItems.length-1))*(cW-pad*2);
          const d = h.date ? new Date(h.date) : null;
          const label = d ? `${d.getMonth()+1}/${d.getDate()}` : "";
          return <text key={i} x={x} y={cH-4} textAnchor="middle" fontSize="7" fill="rgba(255,255,255,0.35)">{label}</text>;
        })}
      </svg>
      {/* 凡例 */}
      <div style={{display:"flex",flexWrap:"wrap",gap:"6px 12px",marginTop:8}}>
        {metrics.map((m,i) => (
          <div key={i} style={{display:"flex",alignItems:"center",gap:4}}>
            <div style={{width:16,height:3,borderRadius:2,background:m.color}}/>
            <span style={{fontSize:10,color:"rgba(255,255,255,0.5)"}}>{m.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ComparePanel({ current, prev }) {
  if (!prev) return null;
  const diff = scoreDiff(current.score, prev.score);
  return (<div style={{background:C.panel,border:`${C.borderW} solid ${C.border}`,borderRadius:14,padding:"16px 18px",marginBottom:10}}><div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:12}}>前回との比較 — {formatDate(prev.date)}</div><div style={{display:"flex",alignItems:"center",gap:16,marginBottom:14}}><div style={{textAlign:"center"}}><div style={{fontSize:11,color:C.muted,marginBottom:4}}>前回</div><div style={{fontSize:28,fontWeight:900,color:C.mutedLight,fontFamily:"'Space Mono',monospace"}}>{prev.score}</div></div><div style={{flex:1,textAlign:"center"}}><div style={{fontSize:22,fontWeight:900,color:diff.color,fontFamily:"'Space Mono',monospace"}}>{diff.label}</div><div style={{fontSize:10,color:C.muted}}>変化</div></div><div style={{textAlign:"center"}}><div style={{fontSize:11,color:C.muted,marginBottom:4}}>今回</div><div style={{fontSize:28,fontWeight:900,color:diff.color,fontFamily:"'Space Mono',monospace"}}>{current.score}</div></div></div>{current.progress&&<div style={{background:C.surface,borderRadius:8,padding:"10px 12px",borderLeft:`3px solid ${C.blue}`,fontSize:12,color:C.text,lineHeight:1.7}}>💬 {current.progress}</div>}</div>);
}
function SeverityDot({ s }) {
  const col=s==="high"?C.red:s==="medium"?C.amber:C.accent;
  return <span style={{display:"inline-block",width:7,height:7,borderRadius:"50%",background:col,marginRight:6,flexShrink:0,marginTop:5}}/>;
}
function getStepPoseSVG(step, col) {
  const s = step || "";
  const size = 48;
  if (s.includes("座")||s.includes("腰かけ")||s.includes("イス")||s.includes("椅子")) {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect x="8" y="30" width="32" height="3.5" rx="1.75" fill={col} opacity="0.35"/>
        <rect x="10" y="33" width="3.5" height="10" rx="1.75" fill={col} opacity="0.25"/>
        <rect x="34" y="33" width="3.5" height="10" rx="1.75" fill={col} opacity="0.25"/>
        <rect x="33" y="18" width="3.5" height="14" rx="1.75" fill={col} opacity="0.25"/>
        <circle cx="24" cy="8" r="5.5" fill={col}/>
        <rect x="19" y="13" width="10" height="12" rx="5" fill={col} opacity="0.85"/>
        <rect x="13" y="24" width="9" height="4.5" rx="2.25" fill={col} opacity="0.75"/>
        <rect x="26" y="24" width="9" height="4.5" rx="2.25" fill={col} opacity="0.75"/>
        <rect x="13" y="28" width="3.5" height="8" rx="1.75" fill={col} opacity="0.65"/>
        <rect x="31" y="28" width="3.5" height="8" rx="1.75" fill={col} opacity="0.65"/>
      </svg>
    );
  }
  if (s.includes("足を上げ")||s.includes("膝を上げ")||s.includes("脚を上げ")||s.includes("高く上げ")) {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="7" r="5.5" fill={col}/>
        <line x1="24" y1="12" x2="24" y2="28" stroke={col} strokeWidth="3.5" strokeLinecap="round"/>
        <line x1="24" y1="18" x2="14" y2="24" stroke={col} strokeWidth="3" strokeLinecap="round" opacity="0.75"/>
        <line x1="24" y1="18" x2="34" y2="24" stroke={col} strokeWidth="3" strokeLinecap="round" opacity="0.75"/>
        <line x1="24" y1="28" x2="16" y2="42" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.85"/>
        <line x1="24" y1="28" x2="32" y2="22" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.75"/>
        <line x1="32" y1="22" x2="40" y2="26" stroke={col} strokeWidth="3" strokeLinecap="round" opacity="0.65"/>
        <line x1="8" y1="44" x2="40" y2="44" stroke={col} strokeWidth="1.5" strokeLinecap="round" opacity="0.25"/>
      </svg>
    );
  }
  if (s.includes("立ち上が")||s.includes("立って")||s.includes("立つ")||s.includes("立ちます")) {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="7" r="5.5" fill={col}/>
        <line x1="24" y1="12" x2="24" y2="30" stroke={col} strokeWidth="3.5" strokeLinecap="round"/>
        <line x1="24" y1="18" x2="14" y2="25" stroke={col} strokeWidth="3" strokeLinecap="round" opacity="0.75"/>
        <line x1="24" y1="18" x2="34" y2="25" stroke={col} strokeWidth="3" strokeLinecap="round" opacity="0.75"/>
        <line x1="24" y1="30" x2="18" y2="44" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.85"/>
        <line x1="24" y1="30" x2="30" y2="44" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.7"/>
        <line x1="8" y1="44" x2="40" y2="44" stroke={col} strokeWidth="1.5" strokeLinecap="round" opacity="0.25"/>
      </svg>
    );
  }
  if (s.includes("かかと")||s.includes("つま先")||s.includes("踵")||s.includes("爪先")) {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="7" r="5.5" fill={col}/>
        <line x1="24" y1="12" x2="24" y2="30" stroke={col} strokeWidth="3.5" strokeLinecap="round"/>
        <line x1="24" y1="18" x2="14" y2="24" stroke={col} strokeWidth="3" strokeLinecap="round" opacity="0.75"/>
        <line x1="24" y1="18" x2="34" y2="24" stroke={col} strokeWidth="3" strokeLinecap="round" opacity="0.75"/>
        <line x1="24" y1="30" x2="18" y2="40" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.85"/>
        <line x1="24" y1="30" x2="30" y2="40" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.7"/>
        <line x1="18" y1="40" x2="18" y2="36" stroke={col} strokeWidth="3" strokeLinecap="round" opacity="0.8"/>
        <line x1="30" y1="40" x2="30" y2="36" stroke={col} strokeWidth="3" strokeLinecap="round" opacity="0.65"/>
        <line x1="8" y1="44" x2="40" y2="44" stroke={col} strokeWidth="1.5" strokeLinecap="round" opacity="0.25"/>
      </svg>
    );
  }
  if (s.includes("腕")||s.includes("手を")||s.includes("前に伸")) {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="7" r="5.5" fill={col}/>
        <line x1="24" y1="12" x2="24" y2="30" stroke={col} strokeWidth="3.5" strokeLinecap="round"/>
        <line x1="24" y1="18" x2="8" y2="22" stroke={col} strokeWidth="3" strokeLinecap="round" opacity="0.85"/>
        <line x1="24" y1="18" x2="40" y2="22" stroke={col} strokeWidth="3" strokeLinecap="round" opacity="0.85"/>
        <line x1="24" y1="30" x2="18" y2="44" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.85"/>
        <line x1="24" y1="30" x2="30" y2="44" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.7"/>
        <line x1="8" y1="44" x2="40" y2="44" stroke={col} strokeWidth="1.5" strokeLinecap="round" opacity="0.25"/>
      </svg>
    );
  }
  if (s.includes("深呼吸")||s.includes("息を")||s.includes("呼吸")||s.includes("リラックス")) {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="7" r="5.5" fill={col}/>
        <line x1="24" y1="12" x2="24" y2="30" stroke={col} strokeWidth="3.5" strokeLinecap="round"/>
        <line x1="24" y1="17" x2="14" y2="22" stroke={col} strokeWidth="3" strokeLinecap="round" opacity="0.75"/>
        <line x1="24" y1="17" x2="34" y2="22" stroke={col} strokeWidth="3" strokeLinecap="round" opacity="0.75"/>
        <line x1="24" y1="30" x2="18" y2="44" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.85"/>
        <line x1="24" y1="30" x2="30" y2="44" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.7"/>
        <path d="M 14 10 Q 10 14 14 18" stroke={col} strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.5"/>
        <path d="M 34 10 Q 38 14 34 18" stroke={col} strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.5"/>
        <line x1="8" y1="44" x2="40" y2="44" stroke={col} strokeWidth="1.5" strokeLinecap="round" opacity="0.25"/>
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="7" r="5.5" fill={col}/>
      <line x1="24" y1="12" x2="24" y2="30" stroke={col} strokeWidth="3.5" strokeLinecap="round"/>
      <line x1="24" y1="18" x2="14" y2="25" stroke={col} strokeWidth="3" strokeLinecap="round" opacity="0.75"/>
      <line x1="24" y1="18" x2="34" y2="25" stroke={col} strokeWidth="3" strokeLinecap="round" opacity="0.75"/>
      <line x1="24" y1="30" x2="18" y2="44" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.85"/>
      <line x1="24" y1="30" x2="30" y2="44" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.7"/>
      <line x1="8" y1="44" x2="40" y2="44" stroke={col} strokeWidth="1.5" strokeLinecap="round" opacity="0.25"/>
    </svg>
  );
}

function getExerciseSVG(name, target, col) {
  const t = (name||"") + (target||"");
  // 椅子・座位系
  if (t.includes("イス")||t.includes("椅子")||t.includes("座って")||t.includes("座位")) {
    return (
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
        {/* 椅子 */}
        <rect x="10" y="36" width="36" height="4" rx="2" fill={col} opacity="0.4"/>
        <rect x="12" y="40" width="4" height="10" rx="2" fill={col} opacity="0.3"/>
        <rect x="40" y="40" width="4" height="10" rx="2" fill={col} opacity="0.3"/>
        <rect x="38" y="20" width="4" height="20" rx="2" fill={col} opacity="0.3"/>
        {/* 人物 */}
        <circle cx="28" cy="10" r="6" fill={col}/>
        {/* 胴体 */}
        <rect x="22" y="16" width="12" height="14" rx="6" fill={col} opacity="0.85"/>
        {/* 太もも */}
        <rect x="16" y="28" width="10" height="5" rx="2.5" fill={col} opacity="0.8"/>
        <rect x="30" y="28" width="10" height="5" rx="2.5" fill={col} opacity="0.8"/>
        {/* 片足上げ */}
        <rect x="16" y="33" width="4" height="10" rx="2" fill={col} opacity="0.7"/>
        <line x1="36" y1="33" x2="44" y2="30" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.8"/>
      </svg>
    );
  }
  // 歩行・歩き系
  if (t.includes("歩")||t.includes("ウォーク")||t.includes("シルバーカー")||t.includes("歩行")) {
    return (
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
        {/* 人物 */}
        <circle cx="28" cy="9" r="6" fill={col}/>
        {/* 胴体 */}
        <line x1="28" y1="15" x2="28" y2="32" stroke={col} strokeWidth="4" strokeLinecap="round"/>
        {/* 腕 */}
        <line x1="28" y1="20" x2="18" y2="28" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.8"/>
        <line x1="28" y1="20" x2="38" y2="26" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.8"/>
        {/* 足 */}
        <line x1="28" y1="32" x2="18" y2="46" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.9"/>
        <line x1="28" y1="32" x2="36" y2="44" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.7"/>
        {/* 地面 */}
        <line x1="10" y1="50" x2="46" y2="50" stroke={col} strokeWidth="2" strokeLinecap="round" opacity="0.3"/>
      </svg>
    );
  }
  // バランス・片足立ち系
  if (t.includes("バランス")||t.includes("片足")||t.includes("重心")||t.includes("かかと上げ")||t.includes("つま先")) {
    return (
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
        {/* 人物 */}
        <circle cx="28" cy="9" r="6" fill={col}/>
        {/* 胴体 */}
        <line x1="28" y1="15" x2="28" y2="33" stroke={col} strokeWidth="4" strokeLinecap="round"/>
        {/* 腕バランス */}
        <line x1="28" y1="21" x2="14" y2="26" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.8"/>
        <line x1="28" y1="21" x2="42" y2="26" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.8"/>
        {/* 片足立ち */}
        <line x1="28" y1="33" x2="28" y2="50" stroke={col} strokeWidth="4" strokeLinecap="round"/>
        {/* 上げた足 */}
        <line x1="28" y1="38" x2="38" y2="44" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.7"/>
        {/* 地面 */}
        <line x1="14" y1="50" x2="42" y2="50" stroke={col} strokeWidth="2" strokeLinecap="round" opacity="0.3"/>
      </svg>
    );
  }
  // 壁・立位・背すじ系
  if (t.includes("壁")||t.includes("背すじ")||t.includes("立ち")||t.includes("伸ばし")||t.includes("姿勢")) {
    return (
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
        {/* 壁 */}
        <rect x="38" y="6" width="5" height="46" rx="2.5" fill={col} opacity="0.2"/>
        {/* 人物 */}
        <circle cx="26" cy="10" r="6" fill={col}/>
        {/* 胴体まっすぐ */}
        <line x1="26" y1="16" x2="26" y2="36" stroke={col} strokeWidth="4" strokeLinecap="round"/>
        {/* 腕 壁に添える */}
        <line x1="26" y1="22" x2="37" y2="24" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.8"/>
        <line x1="26" y1="22" x2="16" y2="28" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.6"/>
        {/* 足 */}
        <line x1="26" y1="36" x2="20" y2="50" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.9"/>
        <line x1="26" y1="36" x2="32" y2="50" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.7"/>
        {/* 地面 */}
        <line x1="10" y1="50" x2="42" y2="50" stroke={col} strokeWidth="2" strokeLinecap="round" opacity="0.3"/>
      </svg>
    );
  }
  // デフォルト（体操一般）
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
      <circle cx="28" cy="9" r="6" fill={col}/>
      <line x1="28" y1="15" x2="28" y2="33" stroke={col} strokeWidth="4" strokeLinecap="round"/>
      <line x1="28" y1="20" x2="16" y2="30" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.8"/>
      <line x1="28" y1="20" x2="40" y2="30" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.8"/>
      <line x1="28" y1="33" x2="20" y2="50" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.9"/>
      <line x1="28" y1="33" x2="36" y2="50" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.7"/>
      <line x1="10" y1="50" x2="46" y2="50" stroke={col} strokeWidth="2" strokeLinecap="round" opacity="0.3"/>
    </svg>
  );
}

function ExerciseCard({ ex, idx }) {
  const [open,setOpen]=useState(false);
  const cols=[C.accent,C.blue,C.amber,"#c084fc","#f472b6"];
  const col=cols[idx%cols.length];
  return (<div onClick={()=>setOpen(!open)} style={{background:C.panel,border:`1px solid ${open?col+"55":C.border}`,borderRadius:12,padding:"14px 16px",cursor:"pointer",transition:"border-color 0.2s",boxShadow:open?`0 0 24px ${col}18`:"none",marginBottom:8}}><div style={{display:"flex",alignItems:"center",gap:10}}><div style={{flex:1,minWidth:0}}><div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontWeight:700,color:C.text,fontSize:14}}>{ex.name}</span>{ex.isNew===false&&<span style={{fontSize:9,background:C.amber+"22",color:C.amber,border:`1px solid ${C.amber}44`,borderRadius:100,padding:"1px 7px",fontWeight:700}}>継続</span>}</div><div style={{fontSize:11,color:C.muted,marginTop:2}}>{ex.target} ／ {ex.duration}</div></div><div style={{color:C.muted,fontSize:16,transform:open?"rotate(180deg)":"none",transition:"0.2s",flexShrink:0}}>▾</div></div><div style={{display:"flex",justifyContent:"flex-end",marginTop:4,opacity:0.85}}>{getExerciseSVG(ex.name,ex.target,col)}</div>{open&&(<div style={{marginTop:14,borderTop:`${C.borderW} solid ${C.border}`,paddingTop:14}}>{ex.steps.map((s,i)=>(<div key={i} style={{display:"flex",gap:10,marginBottom:12,alignItems:"center",background:col+"08",borderRadius:10,padding:"8px 10px"}}><div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,flexShrink:0}}><span style={{minWidth:22,height:22,borderRadius:"50%",background:col+"22",color:col,fontSize:11,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800}}>{i+1}</span>{getStepPoseSVG(s,col)}</div><span style={{fontSize:13,color:C.text,lineHeight:1.6}}>{s}</span></div>))}<div style={{marginTop:10,padding:"8px 12px",background:col+"0f",borderRadius:8,borderLeft:`3px solid ${col}`,fontSize:12,color:col}}>💡 {ex.effect}</div></div>)}</div>);
}

function GaitRadarChart({ gait }) {
  if (!gait) return null;
  const size = 260, cx = 130, cy = 130, maxR = 90;
  const metrics = [
    { label:"歩行リズム", value:gait.cadence, color:C.accent },
    { label:"歩幅", value:gait.stride, color:C.blue },
    { label:"体幹・姿勢", value:gait.posture, color:C.amber },
    { label:"腕振り", value:gait.armSwing, color:"#c084fc" },
    { label:"足のクリアランス", value:gait.footClearance, color:C.accent },
  ];
  const getScore = (v) => {
    if (!v) return 65;
    const s = String(v);
    if (s==="良好"||s==="正常"||s==="自然") return 85;
    if (s.includes("十分")||s.includes("安定")||s.includes("良く")||s.includes("改善")||s.includes("伸び")) return 80;
    if (s.includes("やや")||s.includes("少し")) return 60;
    if (s.includes("不規則")||s.includes("小さい")||s.includes("少ない")||s.includes("擦る")||s.includes("前かがみ")) return 40;
    return 65;
  };
  const n = metrics.length;
  const toXY = (i, r) => { const a = (Math.PI*2*i/n)-Math.PI/2; return { x: cx+r*Math.cos(a), y: cy+r*Math.sin(a) }; };
  const labelOffset = (i) => { const a = (Math.PI*2*i/n)-Math.PI/2; return { x: cx+(maxR+22)*Math.cos(a), y: cy+(maxR+22)*Math.sin(a) }; };
  const gridLevels = [0.25,0.5,0.75,1];
  const dataPoints = metrics.map((m,i) => toXY(i, maxR*getScore(m.value)/100));
  const dataPath = dataPoints.map((p,i) => `${i===0?"M":"L"} ${p.x} ${p.y}`).join(" ") + " Z";
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
      <svg width={size} height={size} style={{overflow:"visible"}}>
        <defs><radialGradient id="radarFill" cx="50%" cy="50%"><stop offset="0%" stopColor={C.accent} stopOpacity="0.3"/><stop offset="100%" stopColor={C.accent} stopOpacity="0.05"/></radialGradient></defs>
        {gridLevels.map((level,li) => { const pts=Array.from({length:n},(_,i)=>toXY(i,maxR*level)); const path=pts.map((p,i)=>`${i===0?"M":"L"} ${p.x} ${p.y}`).join(" ")+" Z"; return <path key={li} d={path} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1"/>; })}
        {Array.from({length:n},(_,i) => { const outer=toXY(i,maxR); return <line key={i} x1={cx} y1={cy} x2={outer.x} y2={outer.y} stroke="rgba(255,255,255,0.08)" strokeWidth="1"/>; })}
        <path d={dataPath} fill="url(#radarFill)" stroke={C.accent} strokeWidth="2" strokeLinejoin="round" style={{filter:`drop-shadow(0 0 8px ${C.accent}88)`}}/>
        {dataPoints.map((p,i) => <circle key={i} cx={p.x} cy={p.y} r={4} fill={metrics[i].color} stroke={C.bgSolid} strokeWidth={2} style={{filter:`drop-shadow(0 0 4px ${metrics[i].color})`}}/>)}
        {metrics.map((m,i) => { const lp=labelOffset(i); const score=getScore(m.value); return (<g key={i}><text x={lp.x} y={lp.y-6} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.6)" fontFamily={C.font}>{m.label}</text><text x={lp.x} y={lp.y+7} textAnchor="middle" fontSize="9" fill={m.color} fontFamily="monospace" fontWeight="700">{score}%</text></g>); })}
      </svg>
      <div style={{display:"flex",flexDirection:"column",gap:6,width:"100%",marginTop:8}}>
        {metrics.map((m,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:11}}><span style={{color:C.mutedLight}}>{m.label}</span><span style={{color:m.color,fontWeight:700}}>{m.value}</span></div>))}
      </div>
    </div>
  );
}


function FrameStrip({ frames, current, onSelect }) {
  return (<div style={{display:"flex",gap:6,overflowX:"auto",padding:"4px 0 8px"}}>{frames.map((f,i)=>(<div key={i} onClick={()=>onSelect(i)} style={{flexShrink:0,cursor:"pointer",border:`2px solid ${current===i?C.accent:C.border}`,borderRadius:6,overflow:"hidden",boxShadow:current===i?`0 0 12px ${C.accent}44`:"none",transition:"all 0.15s"}}><img src={`data:image/jpeg;base64,${f.b64}`} alt={`f${i}`} style={{display:"block",width:72,height:48,objectFit:"cover"}}/><div style={{textAlign:"center",fontSize:9,color:C.muted,padding:"2px 0",background:C.surface}}>{formatTime(f.time)}</div></div>))}</div>);
}
function scoreDiff(cur, prev) { const d = cur - prev; if (d > 0) return { label: `+${d}`, color: C.accent }; if (d < 0) return { label: `${d}`, color: C.red }; return { label: "±0", color: C.muted }; }

  const [phase, setPhase] = useState("loading");
  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [session, setSession] = useState(null);
  const [myRole, setMyRole] = useState(null);
  const [effectiveFacilityId, setEffectiveFacilityId] = useState(null);
  const [staffs, setStaffs] = useState([]);
  const [staffNameInput, setStaffNameInput] = useState("");
  const [staffEmailInput, setStaffEmailInput] = useState("");
  const [staffRoleInput, setStaffRoleInput] = useState("staff");
  const [showStaffManager, setShowStaffManager] = useState(false);
  const [alertThreshold, setAlertThreshold] = useState(5);
  const [noMeasurementDays, setNoMeasurementDays] = useState(30);
  const [checks, setChecks] = useState({c1:false,c2:false,c3:false,c4:false});
  const [patients, setPatients] = useState([]);
  const [patientId, setPatientId] = useState(null);
  const [patientName, setPatientName] = useState("");
  const [patientAgeGroup, setPatientAgeGroup] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [furiganaInput, setFuriganaInput] = useState("");
  const [ageGroupInput, setAgeGroupInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [patientHistory, setPatientHistory] = useState([]);
  const [videoUrl, setVideoUrl] = useState(null);
  const [frames, setFrames] = useState([]);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [result, setResult] = useState(null);
  const [activeTab, setActiveTab] = useState("gait");
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [isQuick, setIsQuick] = useState(false);
  const [tapTargetX, setTapTargetX] = useState(null); // タップされたX座標（比率0-1）
  const [showTapGuide, setShowTapGuide] = useState(false); // タップガイド表示
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [historyPatient, setHistoryPatient] = useState(null);
  const [historyDetail, setHistoryDetail] = useState(null);
  const [patientNotes, setPatientNotes] = useState([]);
  const [shareToken, setShareToken] = useState(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [reportMonth, setReportMonth] = useState(null);
  const [summaryData, setSummaryData] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryAllData, setSummaryAllData] = useState(null);
  const [showSummaryMonthPicker, setShowSummaryMonthPicker] = useState(false);
  const [noteInput, setNoteInput] = useState("");
  const [myName, setMyName] = useState("");
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const tapTargetXRef = useRef(null);

  const initUserData = async (uid, email) => {
    const result = await getMyRole(uid, email);
    console.log("initUserData result:", result, "email:", email, "uid:", uid);
    
    let targetFacilityId = uid;
    let targetRole = result.role;
    let name = result.name || "管理者";
    
    if (result.role === "staff" && result.facilityId) {
      targetFacilityId = result.facilityId;
      name = result.name || "スタッフ";
    }
    
    setMyRole(targetRole);
    setEffectiveFacilityId(targetFacilityId);
    setMyName(name);
    
    await Promise.all([
      loadPatients(targetFacilityId),
      loadStaffs(targetFacilityId),
      loadFacilitySettings(targetFacilityId)
    ]);
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      setPhase(current => current === "loading" ? "login" : current);
    }, 3000);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) { setPhase("consent"); initUserData(s.user.id, s.user.email); } else { setPhase("login"); }
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s) { setPhase("consent"); initUserData(s.user.id, s.user.email); } else { setPhase("login"); }
    });
    const l = document.createElement("link");
    l.rel="stylesheet"; l.href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Kosugi+Maru&display=swap";
    document.head.appendChild(l);
    return () => { subscription.unsubscribe(); clearTimeout(timeout); };
  }, []);

  const loadPatients = async (facilityId) => {
    const list = await getPatients(facilityId);
    const withHistory = await Promise.all(list.map(async p => { const hist = await getPatientHistory(p.id); return { ...p, history: hist }; }));
    setPatients(withHistory);
  };
const loadStaffs = async (facilityId) => {
  const list = await getStaffs(facilityId);
  setStaffs(list);
};
const loadFacilitySettings = async (facilityId) => {
  const settings = await getFacilitySettings(facilityId);
  setAlertThreshold(settings.alert_threshold || 5);
  setNoMeasurementDays(settings.no_measurement_days || 30);
};

  
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setPhase("login"); setPatients([]); setPatientId(null); setPatientName("");
    setChecks({c1:false,c2:false,c3:false,c4:false});
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.type==="patient") { await deletePatient(deleteConfirm.id); }
    else { await deletePatientHistory(deleteConfirm.id); }
    setDeleteConfirm(null);
    if (session) await loadPatients(effectiveFacilityId);};

  const wrap = {minHeight:"100vh",background:C.bg,fontFamily:C.font,color:C.text,display:"flex",flexDirection:"column",alignItems:"center",padding:"0 16px 48px",position:"relative"};
  const maxW = {width:"100%",maxWidth:520,position:"relative",zIndex:1};

  const handleFile = useCallback((file) => {
    if (!file) return;
    const ext = (file.name?.split(".").pop()||"").toLowerCase();
    const validExt = ["mp4","mov","webm","avi","m4v","3gp","mkv"].includes(ext);
    if (!file.type.startsWith("video/") && !validExt) { setError("動画ファイルを選択してください（MP4・MOV・WebMなど）"); return; }
    if (file.size > 200*1024*1024) { setError("ファイルサイズは200MB以下にしてください"); return; }
    setError(null); setVideoUrl(URL.createObjectURL(file));
  }, []);

  const handleDrop = useCallback((e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }, [handleFile]);

  const startAnalysis = async () => {
    if (!videoRef.current) return;
    setPhase("extracting"); setProgress(0); setError(null);
    try {
      const vid = document.createElement("video");
      vid.muted=true; vid.playsInline=true; vid.preload="auto";
      vid.style.cssText="position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;top:-9999px";
      document.body.appendChild(vid);
      try {
        vid.src = videoUrl;
        await new Promise((res,rej) => {
          const timer = setTimeout(()=>rej(new Error("メタデータ読み込みタイムアウト")),15000);
          vid.onloadedmetadata = ()=>{clearTimeout(timer);res();};
          vid.onerror = ()=>{clearTimeout(timer);rej(new Error(`動画の読み込みエラー: ${vid.error?.message||"不明"}`));};
          vid.load();
        });
        const duration = vid.duration;
        if (!duration||!isFinite(duration)||duration<=0) throw new Error("動画の長さを取得できません");
        setProgressLabel("フレーム抽出中...");
        const FRAME_COUNT = 6;
        const extracted = [];
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const vw=vid.videoWidth||640, vh=vid.videoHeight||480;
        const w=Math.min(vw,512), fh=Math.round(w*(vh/vw));
        canvas.width=w; canvas.height=fh;
        for (let i=0; i<FRAME_COUNT; i++) {
          const t = (i/(FRAME_COUNT-1))*duration*0.85+duration*0.05;
          await new Promise(res => { const timer=setTimeout(res,3000); vid.onseeked=()=>{clearTimeout(timer);vid.onseeked=null;res();}; vid.currentTime=t; });
          await new Promise(r=>setTimeout(r,150));
          const tapX = tapTargetXRef.current;
          if (tapX !== null) {
            const cropW = Math.round(vw * 0.4);
            const cropX = Math.max(0, Math.min(vw - cropW, Math.round(vw * tapX - cropW / 2)));
            const trimW = Math.min(512, cropW);
            const trimH = Math.round(trimW * (vh / cropW));
            canvas.width = trimW;
            canvas.height = trimH;
            ctx.drawImage(vid, cropX, 0, cropW, vh, 0, 0, trimW, trimH);
          } else {
            ctx.drawImage(vid, 0, 0, w, fh);
          }
          extracted.push({time:t,b64:toBase64(canvas),w,h:fh});
          setProgress(Math.round(((i+1)/FRAME_COUNT)*40));
        }
        if (extracted.length===0) throw new Error("フレームを抽出できませんでした");
        setFrames(extracted);
        setProgressLabel("AIが歩行を解析中...");
        setPhase("analyzing");
        const imageContent = extracted.flatMap((f,i)=>([
          {type:"text",text:`【フレーム${i+1}/${extracted.length} — ${formatTime(f.time)}】`},
          {type:"image",source:{type:"base64",media_type:"image/jpeg",data:f.b64}},
        ]));
        imageContent.push({type:"text",text:buildPrompt(extracted.length,patientHistory,patientAgeGroup)});
        const resp = await fetch("/api/analyze",{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({messages:[{role:"user",content:imageContent}]}),
        });
        setProgress(90);
        const data = await resp.json();
        if (data.error) throw new Error(data.error.message||JSON.stringify(data.error)||"APIエラー");
        const raw = (data.content||[]).map(b=>b.text||"").join("");
        const parsed = JSON.parse(raw.replace(/```json|```/g,"").trim());
        setProgress(100);
        await new Promise(r=>setTimeout(r,300));
        // ③始点ルール（コード側で強制）
        const hasAids = parsed.aids && parsed.aids.detected && parsed.aids.detected.length > 0;
        const hasRhythm = parsed.gait && (parsed.gait.cadence||"").includes("安定") || (parsed.gait&&parsed.gait.cadence||"").includes("リズム") || (parsed.gait&&parsed.gait.cadence||"").includes("一定");
        // 補助具あり→最低60点、補助具なし→最低70点
        const hasAidsCheck = parsed.aids && parsed.aids.detected && parsed.aids.detected.length > 0;
        if (hasAidsCheck && parsed.score < 60) parsed.score = 60;
        if (!hasAidsCheck && parsed.score < 70) parsed.score = 70;
        if (hasRhythm && parsed.score < 70) parsed.score = 70;

        const parsedFixed = { ...parsed, summary: fixTerms(parsed.summary), progress: fixTerms(parsed.progress), aids: parsed.aids ? { ...parsed.aids, detected: (parsed.aids.detected||[]).map(fixTerms), usage: fixTerms(parsed.aids.usage), recommendation: fixTerms(parsed.aids.recommendation) } : parsed.aids, gait: parsed.gait ? Object.fromEntries(Object.entries(parsed.gait).map(([k,v])=>[k,fixTerms(v)])) : parsed.gait, issues: (parsed.issues||[]).map(iss=>({...iss, title:fixTerms(iss.title), detail:fixTerms(iss.detail)})), exercises: (parsed.exercises||[]).map(ex=>({...ex, name:fixTerms(ex.name), target:fixTerms(ex.target), effect:fixTerms(ex.effect), steps:(ex.steps||[]).map(fixTerms)})), lifestyle: (parsed.lifestyle||[]).map(fixTerms) };
        if (!isQuick) {
          const record = { date:new Date().toISOString(), score:parsedFixed.score, summary:parsedFixed.summary, issues:parsedFixed.issues, exercises:parsedFixed.exercises };
          await saveAnalysis(patientId, effectiveFacilityId, record, parsedFixed);
          const newHistory = await getPatientHistory(patientId);
          setPatientHistory(newHistory);
          setActiveTab(newHistory.length>1?"compare":"gait");
        } else {
          setPatientHistory([]);
          setActiveTab("gait");
        }
        setResult(parsedFixed);
        setPhase("result");
      } finally { vid.src=""; document.body.removeChild(vid); }
    } catch(e) { console.error(e); setError("エラー: "+e.message); setPhase("upload"); }
  };

  const restart = async () => {
    setPhase("userSelect");
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null); setFrames([]); setResult(null);
    setError(null); setProgress(0); setActiveTab("gait"); setCurrentFrame(0);
    setTapTargetX(null);
    tapTargetXRef.current = null;
    if (session) await loadPatients(effectiveFacilityId);
  };

  // ── LOGIN ─────────────────────────────────────────────────────────────────
  if (phase==="login") {
    const handleAuth = async () => {
      if (!authEmail.trim()||!authPassword.trim()) return;
      setAuthLoading(true); setAuthError(null);
      if (authMode==="login") {
        const lockStatus = await checkLoginLock(authEmail.trim());
        if (lockStatus.locked) {
          const minutes = Math.ceil(lockStatus.remainingSeconds / 60);
          setAuthError(`ログイン試行回数が多いため、一時的にロックされています。約${minutes}分後に再度お試しください。`);
          setAuthLoading(false);
          return;
        }
      }
      let error;
      if (authMode==="signup") {
        const res = await supabase.auth.signUp({ email:authEmail, password:authPassword });
        error = res.error;
        if (!error) { setAuthError("確認メールを送信しました。メールのリンクをクリックしてからログインしてください。"); setAuthMode("login"); setAuthLoading(false); return; }
      } else {
        const res = await supabase.auth.signInWithPassword({ email:authEmail, password:authPassword });
        error = res.error;
        if (!error) {
          await resetLoginFailure(authEmail.trim());
        } else {
          const failResult = await recordLoginFailure(authEmail.trim());
          if (failResult.locked) {
            setAuthError("ログイン試行回数が5回を超えたため、30分間ロックされました。");
            setAuthLoading(false);
            return;
          } else {
            setAuthError(`メールアドレスまたはパスワードが間違っています。（あと${5 - failResult.newCount}回失敗するとロックされます）`);
            setAuthLoading(false);
            return;
          }
        }
      }
      if (error) setAuthError(error.message);
      setAuthLoading(false);
    };
    return (
      <div style={wrap}><GlassOrbs/><ThemeToggle toggleTheme={toggleTheme} theme={theme}/><div style={maxW}>
        <div style={{paddingTop:60,marginBottom:32,textAlign:"center"}}>
          <div style={{display:"inline-flex",gap:6,alignItems:"center",background:"rgba(57,224,176,0.12)",border:`1px solid rgba(57,224,176,0.25)`,borderRadius:100,padding:"5px 14px",marginBottom:20,fontSize:10,color:C.accent,letterSpacing:3,fontWeight:700}}>🎬 VIDEO GAIT ANALYSIS</div>
          <h1 style={{fontSize:26,fontWeight:900,lineHeight:1.3,margin:0,color:C.text}}>{authMode==="login"?"施設ログイン":"施設アカウント登録"}</h1>
          <p style={{color:C.muted,marginTop:10,fontSize:13}}>{authMode==="login"?"メールアドレスとパスワードでログイン":"施設のメールとパスワードを設定"}</p>
        </div>
        {authError&&<div style={{background:authError.includes("確認メール")?"rgba(57,224,176,0.12)":"rgba(255,77,109,0.12)",border:`1px solid ${authError.includes("確認メール")?"rgba(57,224,176,0.3)":"rgba(255,77,109,0.3)"}`,borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:13,color:authError.includes("確認メール")?C.accent:C.red}}>{authError}</div>}
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
          <input value={authEmail} onChange={e=>setAuthEmail(e.target.value)} placeholder="メールアドレス" type="email" style={{background:"rgba(255,255,255,0.07)",border:`${C.borderW} solid ${C.border}`,borderRadius:12,padding:"13px 14px",color:C.text,fontSize:14,fontFamily:C.font,outline:"none"}}/>
          <input value={authPassword} onChange={e=>setAuthPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAuth()} placeholder="パスワード（8文字以上）" type="password" style={{background:"rgba(255,255,255,0.07)",border:`${C.borderW} solid ${C.border}`,borderRadius:12,padding:"13px 14px",color:C.text,fontSize:14,fontFamily:C.font,outline:"none"}}/>
        </div>
        <button onClick={handleAuth} disabled={authLoading||!authEmail.trim()||!authPassword.trim()} style={{width:"100%",padding:"14px",background:authEmail.trim()&&authPassword.trim()?`linear-gradient(135deg,${C.accent},${C.accentDim})`:"rgba(255,255,255,0.1)",border:"none",borderRadius:12,color:authEmail.trim()&&authPassword.trim()?C.bgSolid:C.muted,fontSize:15,fontWeight:700,cursor:"pointer",transition:"all 0.2s",fontFamily:C.font,marginBottom:14,boxShadow:authEmail.trim()&&authPassword.trim()?`0 4px 24px rgba(57,224,176,0.3)`:"none"}}>
          {authLoading?"処理中...":authMode==="login"?"ログイン →":"アカウントを作成 →"}
        </button>
        <div style={{textAlign:"center"}}>
          <button onClick={()=>{setAuthMode(authMode==="login"?"signup":"login");setAuthError(null);}} style={{background:"none",border:"none",color:C.accent,cursor:"pointer",fontSize:13,fontFamily:C.font}}>
            {authMode==="login"?"アカウントをお持ちでない方はこちら →":"ログイン画面に戻る"}
          </button>
        </div>
      </div></div>
    );
  }

  // ── CONSENT ───────────────────────────────────────────────────────────────
  if (phase==="consent") {
    const allChecked = Object.values(checks).every(Boolean);
    const ITEMS = [
      {key:"c1",label:"撮影される本人（または法定代理人）の同意を得ています",note:"認知症・未成年の場合は家族・後見人などの代理同意が必要です",imp:true},
      {key:"c2",label:"動画に映った画像がAI解析のためAnthropicのサーバーに送信されることを理解しています",note:"Anthropicのプライバシーポリシーが適用されます",imp:true},
      {key:"c3",label:"取得した動画・解析結果は目的外に利用しません",note:"第三者への無断提供・SNSへの無断投稿などは行いません",imp:true},
      {key:"c4",label:"本アプリの解析結果は参考情報であり、医療診断の代替ではないことを理解しています",note:"強い不安がある場合は医療機関・理学療法士にご相談ください",imp:false},
    ];
    return (
      <div style={wrap}><GlassOrbs/><StaffManager
        show={showStaffManager}
        onClose={() => setShowStaffManager(false)}
        theme={theme}
        C={C}
        alertThreshold={alertThreshold}
        setAlertThreshold={setAlertThreshold}
        noMeasurementDays={noMeasurementDays}
        setNoMeasurementDays={setNoMeasurementDays}
        myRole={myRole}
        staffs={staffs}
        session={session}
        loadStaffs={loadStaffs}
      /><ThemeToggle toggleTheme={toggleTheme} theme={theme}/><div style={maxW}>
        <div style={{paddingTop:16,display:"flex",justifyContent:"flex-end"}}>
          <div style={{display:"flex",gap:8}}>
  {myRole==="admin"&&<button onClick={()=>setShowStaffManager(true)} style={{background:"none",border:`${C.borderW} solid ${C.border}`,color:C.accent,cursor:"pointer",fontSize:12,padding:"5px 12px",borderRadius:8,fontFamily:C.font}}>👥 スタッフ管理</button>}
  <button onClick={handleLogout} style={{background:"none",border:`${C.borderW} solid ${C.border}`,color:C.muted,cursor:"pointer",fontSize:12,padding:"5px 12px",borderRadius:8,fontFamily:C.font}}>ログアウト</button>
</div>
        </div>
        <div style={{paddingTop:24,marginBottom:28,textAlign:"center"}}>
          <div style={{display:"inline-flex",gap:6,alignItems:"center",background:C.accent+"14",border:`1px solid ${C.accent}2a`,borderRadius:100,padding:"5px 14px",marginBottom:20,fontSize:10,color:C.accent,letterSpacing:3,fontWeight:700}}>🎬 VIDEO GAIT ANALYSIS</div>
          <h1 style={{fontSize:26,fontWeight:900,lineHeight:1.3,margin:0,color:C.text}}>ご利用前の<br/><span style={{color:C.accent}}>同意確認</span></h1>
          <p style={{color:C.muted,marginTop:12,fontSize:13,lineHeight:1.8}}>本アプリは歩行動画をAIで解析します。<br/>下記をご確認のうえ、すべてにチェックをお願いします。</p>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>
          {ITEMS.map(({key,label,note,imp})=>{ const checked=checks[key]; return (
            <div key={key} onClick={()=>setChecks(p=>({...p,[key]:!p[key]}))} style={{display:"flex",gap:12,alignItems:"flex-start",background:checked?C.accent+"0a":C.surface,border:`${C.borderW} solid ${checked?C.accent+"55":C.border}`,borderRadius:12,padding:"14px 16px",cursor:"pointer",transition:"all 0.15s"}}>
              <div style={{width:22,height:22,borderRadius:6,flexShrink:0,marginTop:1,border:`2px solid ${checked?C.accent:imp?C.amber+"88":C.muted}`,background:checked?C.accent:"transparent",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s"}}>
                {checked&&<svg width="12" height="10" viewBox="0 0 12 10" fill="none"><path d="M1 5L4.5 8.5L11 1" stroke={C.bgSolid} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </div>
              <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,lineHeight:1.5,color:C.text}}>{imp&&<span style={{color:C.amber,fontSize:10,marginRight:4}}>★</span>}{label}</div><div style={{fontSize:11,color:C.muted,marginTop:4,lineHeight:1.6}}>{note}</div></div>
            </div>
          );})}
        </div>
        <div style={{background:C.surface,border:`${C.borderW} solid ${C.border}`,borderRadius:10,padding:"12px 16px",marginBottom:20,fontSize:12,color:C.muted,lineHeight:1.7}}>
          📄 Anthropicのプライバシーポリシー：<a href="https://www.anthropic.com/privacy" target="_blank" rel="noopener noreferrer" style={{color:C.accent,marginLeft:4}}>anthropic.com/privacy</a>
        </div>
        <button onClick={()=>allChecked&&setPhase("userSelect")} disabled={!allChecked} style={{width:"100%",padding:"15px",background:allChecked?`linear-gradient(135deg,${C.accent},${C.accentDim})`:C.border,border:"none",borderRadius:12,color:allChecked?C.bgSolid:C.muted,fontSize:15,fontWeight:700,cursor:allChecked?"pointer":"not-allowed",transition:"all 0.2s",fontFamily:C.font,boxShadow:allChecked?`0 4px 20px ${C.accent}33`:"none"}}>
          {allChecked?"同意して次へ →":`あと ${Object.values(checks).filter(v=>!v).length} 項目の確認が必要です`}
        </button>
        <div style={{textAlign:"center",marginTop:10,fontSize:11,color:C.muted}}>★ は特に重要な項目です</div>
      </div></div>
    );
  }

  // ── HISTORY DETAIL ────────────────────────────────────────────────────────
  if (phase==="historyList" && historyDetail) {
    const h = historyDetail;
    const handleHistoryPrint = () => {
      const html = buildPrintHTML({
        patientName: historyPatient.name,
        measureNo: (historyPatient.history||[]).findIndex(x=>x.id===h.id) + 1,
        dateStr: formatDate(h.date),
        result: h,
      });
      openPrintWindow(html);
    };
    return (
      <div style={wrap}><GlassOrbs/><ThemeToggle toggleTheme={toggleTheme} theme={theme}/><div style={maxW}>
        <div style={{paddingTop:40,marginBottom:24}}>
          <button onClick={()=>setHistoryDetail(null)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:13,padding:0,marginBottom:20,fontFamily:C.font}}>← 履歴一覧に戻る</button>
          <div style={{fontSize:11,color:C.muted,marginBottom:4}}>{formatDate(h.date)}</div>
          <h2 style={{fontSize:20,fontWeight:900,margin:0,color:C.text}}>{h.summary}</h2>
        </div>
        <div style={{background:C.surface,border:`${C.borderW} solid ${C.border}`,borderRadius:20,padding:"24px 20px",marginBottom:12,display:"flex",flexDirection:"column",alignItems:"center"}}>
          <ScoreArc score={h.score}/>
          <div style={{fontWeight:900,fontSize:15,marginTop:4,textAlign:"center",color:C.text}}>{h.summary}</div>
        </div>
        {h.gait&&(<div style={{background:C.panel,border:`${C.borderW} solid ${C.border}`,borderRadius:14,padding:"20px 18px",marginBottom:12}}><div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:16}}>GAIT METRICS</div><GaitRadarChart gait={h.gait}/></div>)}
        {h.issues&&h.issues.length>0&&(<div style={{marginBottom:12}}><div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:10}}>課題</div><div style={{display:"flex",flexDirection:"column",gap:8}}>{h.issues.map((issue,i)=>(<div key={i} style={{background:C.panel,border:`${C.borderW} solid ${C.border}`,borderRadius:12,padding:"14px 16px"}}><div style={{display:"flex",alignItems:"flex-start",gap:4,marginBottom:6}}><SeverityDot s={issue.severity}/><span style={{fontWeight:700,fontSize:14,color:C.text}}>{issue.title}</span></div><p style={{margin:0,fontSize:13,color:C.mutedLight,lineHeight:1.65,paddingLeft:13}}>{issue.detail}</p></div>))}</div></div>)}
        {h.exercises&&h.exercises.length>0&&(<div style={{marginBottom:12}}><div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:10}}>体操メニュー</div>{h.exercises.map((ex,i)=><ExerciseCard key={i} ex={ex} idx={i}/>)}</div>)}
        <div style={{display:"flex",gap:10,marginTop:4}}>
          <button onClick={()=>setHistoryDetail(null)} style={{flex:1,padding:"13px",background:C.surface,border:`${C.borderW} solid ${C.border}`,borderRadius:12,color:C.mutedLight,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:C.font}}>← 履歴一覧</button>
          <button onClick={handleHistoryPrint} style={{flex:1,padding:"13px",background:`linear-gradient(135deg,${C.accent},${C.accentDim})`,border:"none",borderRadius:12,color:C.bgSolid,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:C.font}}>🖨️ 印刷</button>
          <button onClick={()=>{setPatientId(historyPatient.id);setPatientName(historyPatient.name);setPatientAgeGroup(historyPatient.age_group || "");setPatientHistory(historyPatient.history||[]);setPhase("upload");}} style={{flex:1,padding:"13px",background:C.surface,border:`${C.borderW} solid ${C.border}`,borderRadius:12,color:C.text,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:C.font}}>新しく測定 →</button>
        </div>
      </div></div>
    );
  }

  // ── HISTORY LIST ──────────────────────────────────────────────────────────
  if (phase==="historyList" && historyPatient) {
    const hist = historyPatient.history || [];
    return (
      <div style={wrap}><GlassOrbs/><ThemeToggle toggleTheme={toggleTheme} theme={theme}/><div style={maxW}>
       <div style={{paddingTop:40,marginBottom:24}}>
          <button onClick={()=>{setPhase("userSelect");setHistoryPatient(null);}} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:13,padding:0,marginBottom:20,fontFamily:C.font}}>← 利用者選択に戻る</button>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div>
              <h2 style={{fontSize:22,fontWeight:900,margin:0,color:C.text}}>{historyPatient.name}</h2>
              <p style={{color:C.muted,fontSize:13,marginTop:4}}>{hist.length}回の測定履歴</p>
            </div>
            {hist.length>0&&<button onClick={()=>{setPatientId(historyPatient.id);setPatientName(historyPatient.name);setPatientAgeGroup(historyPatient.age_group || "");setPatientHistory(hist);setPhase("upload");}} style={{padding:"8px 14px",background:`linear-gradient(135deg,${C.accent},${C.accentDim})`,border:"none",borderRadius:8,color:C.bgSolid,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:C.font,whiteSpace:"nowrap",marginRight:8}}>＋ 新しく測定</button>}
            {hist.length>0&&<button onClick={()=>downloadCSV(historyPatient.name, hist)} style={{padding:"8px 14px",background:C.surface,border:`${C.borderW} solid ${C.border}`,borderRadius:8,color:C.mutedLight,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:C.font,whiteSpace:"nowrap"}}>📊 CSV</button>}
            {hist.length>0&&!shareToken&&<button disabled={shareLoading} onClick={async()=>{setShareLoading(true);const t=await createShareToken(historyPatient.id, effectiveFacilityId);setShareToken(t);setShareLoading(false);}} style={{padding:"8px 14px",background:C.surface,border:`${C.borderW} solid ${C.border}`,borderRadius:8,color:C.mutedLight,fontSize:12,fontWeight:700,cursor:shareLoading?"default":"pointer",fontFamily:C.font,whiteSpace:"nowrap"}}>👨‍👩‍👧 家族共有リンク発行</button>}
            {hist.length>0&&<button onClick={()=>setShowMonthPicker(true)} style={{padding:"8px 14px",background:C.surface,border:`${C.borderW} solid ${C.border}`,borderRadius:8,color:C.mutedLight,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:C.font,whiteSpace:"nowrap"}}>📅 月次レポート</button>}
          </div>
        </div>
        {shareToken&&(
          <div style={{background:C.panel,border:`${C.borderW} solid ${C.border}`,borderRadius:14,padding:"14px 16px",marginBottom:16,marginTop:12}}>
            <div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:8}}>👨‍👩‍👧 家族共有リンク（ログイン不要）</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
              <input readOnly value={`${window.location.origin}/share/${shareToken}`} onFocus={e=>e.target.select()} style={{flex:1,minWidth:200,background:C.surface,border:`${C.borderW} solid ${C.border}`,borderRadius:8,padding:"8px 10px",color:C.text,fontSize:12,fontFamily:"monospace"}} />
              <button onClick={()=>{navigator.clipboard.writeText(`${window.location.origin}/share/${shareToken}`);setShareCopied(true);setTimeout(()=>setShareCopied(false),2000);}} style={{padding:"8px 14px",background:C.accent,border:"none",borderRadius:8,color:C.bgSolid,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:C.font,whiteSpace:"nowrap"}}>{shareCopied?"コピーしました":"コピー"}</button>
              <button onClick={async()=>{if(!window.confirm("このリンクを無効にしますか？家族が今後アクセスできなくなります。"))return;await deleteShareToken(historyPatient.id);setShareToken(null);}} style={{padding:"8px 14px",background:"transparent",border:`${C.borderW} solid ${C.red}`,borderRadius:8,color:C.red,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:C.font,whiteSpace:"nowrap"}}>リンク無効化</button>
            </div>
          </div>
        )}
        {showMonthPicker&&(()=>{
          const monthSet = new Set(hist.map(h=>{const d=new Date(h.date);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;}));
          const months = Array.from(monthSet).sort().reverse();
          return (
            <div onClick={()=>setShowMonthPicker(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:20}}>
              <div onClick={e=>e.stopPropagation()} style={{background:C.bgSolid,border:`${C.borderW} solid ${C.border}`,borderRadius:14,padding:"20px",maxWidth:340,width:"100%",maxHeight:"70vh",overflowY:"auto"}}>
                <div style={{fontSize:15,fontWeight:900,color:C.text,marginBottom:14}}>📅 対象月を選択</div>
                {months.length===0?(
                  <div style={{color:C.muted,fontSize:13,textAlign:"center",padding:"20px 0"}}>測定データがありません</div>
                ):(
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {months.map(m=>{
                      const [y,mo]=m.split("-");
                      const count = hist.filter(h=>{const d=new Date(h.date);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`===m;}).length;
                      return (
                        <button key={m} onClick={()=>{setReportMonth(m);setShowMonthPicker(false);setPhase("monthlyReport");}} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",background:C.surface,border:`${C.borderW} solid ${C.border}`,borderRadius:10,color:C.text,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:C.font,textAlign:"left"}}>
                          <span>{y}年{parseInt(mo)}月</span>
                          <span style={{fontSize:11,color:C.muted,fontWeight:400}}>{count}回測定</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <button onClick={()=>setShowMonthPicker(false)} style={{marginTop:14,width:"100%",padding:"10px",background:"none",border:"none",color:C.muted,fontSize:13,cursor:"pointer",fontFamily:C.font}}>キャンセル</button>
              </div>
            </div>
          );
        })()}
        <div style={{background:C.panel,border:`${C.borderW} solid ${C.border}`,borderRadius:14,padding:"16px 18px",marginBottom:16}}>
          <div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:12}}>📝 引き継ぎメモ</div>
          <div style={{display:"flex",gap:8,marginBottom:14}}>
            <input
              value={noteInput}
              onChange={e=>setNoteInput(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter"&&!e.isComposing&&e.keyCode!==229&&noteInput.trim()){(async()=>{await createPatientNote(historyPatient.id, effectiveFacilityId, myName, noteInput.trim());setNoteInput("");const notes=await getPatientNotes(historyPatient.id);setPatientNotes(notes);})();}}}
              placeholder="メモを入力（例：午前は機嫌良く歩けていました）"
              style={{flex:1,background:C.surface,border:`${C.borderW} solid ${C.border}`,borderRadius:8,padding:"10px 12px",color:C.text,fontSize:13,fontFamily:C.font,outline:"none"}}
            />
            <button
              onClick={async()=>{if(!noteInput.trim())return;await createPatientNote(historyPatient.id, effectiveFacilityId, myName, noteInput.trim());setNoteInput("");const notes=await getPatientNotes(historyPatient.id);setPatientNotes(notes);}}
              disabled={!noteInput.trim()}
              style={{padding:"10px 16px",background:noteInput.trim()?C.accent:C.border,border:"none",borderRadius:8,color:noteInput.trim()?C.bgSolid:C.muted,fontSize:13,fontWeight:700,cursor:noteInput.trim()?"pointer":"not-allowed",fontFamily:C.font,whiteSpace:"nowrap"}}
            >追加</button>
          </div>
          {patientNotes.length===0?(
            <div style={{textAlign:"center",color:C.muted,fontSize:12,padding:"12px"}}>まだメモはありません</div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {patientNotes.map(note=>(
                <div key={note.id} style={{background:C.surface,borderRadius:8,padding:"10px 12px",borderLeft:`3px solid ${C.accent}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,color:C.text,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{note.content}</div>
                      <div style={{fontSize:10,color:C.muted,marginTop:6}}>{note.author_name||"スタッフ"} ・ {formatDate(note.created_at)}</div>
                    </div>
                    <button
                      onClick={async()=>{if(!window.confirm("このメモを削除しますか？"))return;await deletePatientNote(note.id);const notes=await getPatientNotes(historyPatient.id);setPatientNotes(notes);}}
                      style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:14,flexShrink:0,padding:0}}
                    >×</button>
                  </div>
                </div>
              ))}
            </div>
        　)}
        </div>
        {hist.length>1&&(
          <div style={{background:C.panel,border:`${C.borderW} solid ${C.border}`,borderRadius:14,padding:"16px 18px",marginBottom:16}}>
            <GaitMetricsHistoryChart history={hist}/>
          </div>
        )}
        {hist.length===0?(
          <div style={{background:C.surface,border:`${C.borderW} solid ${C.border}`,borderRadius:12,padding:"32px",textAlign:"center",color:C.muted,fontSize:13}}>まだ測定履歴がありません</div>
        ):(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {hist.map((h,i)=>{
              const col=h.score>=75?C.accent:h.score>=50?C.amber:C.red;
              return (
                <div key={i} style={{background:C.surface,border:`${C.borderW} solid ${C.border}`,borderRadius:12,padding:"14px 16px",transition:"all 0.15s"}}>
                  <div onClick={()=>setHistoryDetail(h)} style={{display:"flex",alignItems:"center",gap:12,cursor:"pointer"}}>
                    <div style={{width:52,height:52,borderRadius:10,background:col+"1a",border:`1px solid ${col}33`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <span style={{fontSize:20,fontWeight:900,color:col,fontFamily:"'Space Mono',monospace",lineHeight:1}}>{h.score}</span>
                      <span style={{fontSize:8,color:C.muted,letterSpacing:1}}>SCORE</span>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:14,color:C.text,marginBottom:2}}>{fixTerms(h.summary)}</div>
                      <div style={{fontSize:11,color:C.muted}}>{formatDate(h.date)}{i===0&&<span style={{marginLeft:6,background:C.accent+"22",color:C.accent,borderRadius:100,padding:"1px 8px",fontSize:10,fontWeight:700}}>最新</span>}</div>
                    </div>
                    <div style={{color:C.muted,fontSize:16}}>›</div>
                  </div>
                  <div style={{marginTop:10,paddingTop:10,borderTop:`${C.borderW} solid ${C.border}`}}>
                    <button
                      onClick={async()=>{
                        if(!window.confirm(`${formatDate(h.date)}の解析結果を削除しますか？`)) return;
                        await deleteSingleHistory(h.id);
                        const newHist = await getPatientHistory(historyPatient.id);
                        const updated = {...historyPatient, history: newHist};
                        setHistoryPatient(updated);
                        if(session) await loadPatients(effectiveFacilityId);
                      }}
                      style={{padding:"5px 10px",background:"transparent",border:`1px solid ${C.red}44`,borderRadius:6,color:C.red,fontSize:10,cursor:"pointer",fontFamily:C.font}}
                    >🗑️ この解析結果を削除</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div></div>
    );
  }

  // ── MONTHLY REPORT ────────────────────────────────────────────────────────
  if (phase==="monthlyReport" && historyPatient && reportMonth) {
    const hist = historyPatient.history || [];
    const [y, mo] = reportMonth.split("-");
    const monthRecords = hist.filter(h=>{
      const d = new Date(h.date);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}` === reportMonth;
    }).sort((a,b)=>new Date(a.date)-new Date(b.date));

    const avgScore = monthRecords.length>0 ? Math.round(monthRecords.reduce((s,h)=>s+h.score,0)/monthRecords.length) : null;
    const firstScore = monthRecords.length>0 ? monthRecords[0].score : null;
    const lastScore = monthRecords.length>0 ? monthRecords[monthRecords.length-1].score : null;
    const scoreDelta = (firstScore!==null && lastScore!==null) ? lastScore-firstScore : null;

    // 体操の実施頻度集計（名前ベース）
    const exerciseCounts = {};
    monthRecords.forEach(h=>{
      (h.exercises||[]).forEach(ex=>{
        exerciseCounts[ex.name] = (exerciseCounts[ex.name]||0)+1;
      });
    });
    const topExercises = Object.entries(exerciseCounts).sort((a,b)=>b[1]-a[1]).slice(0,5);

    // 課題の出現頻度集計
    const issueCounts = {};
    monthRecords.forEach(h=>{
      (h.issues||[]).forEach(iss=>{
        issueCounts[iss.title] = (issueCounts[iss.title]||0)+1;
      });
    });
    const topIssues = Object.entries(issueCounts).sort((a,b)=>b[1]-a[1]).slice(0,5);

    const handlePrintMonthly = () => {
      const win = window.open("","_blank");
      if (!win) return;
      let html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>月次レポート_${historyPatient.name}_${y}年${parseInt(mo)}月</title>
        <style>
          body{font-family:'Hiragino Sans','Yu Gothic',sans-serif;background:#fff;color:#1a1a1a;padding:32px;max-width:760px;margin:0 auto;}
          .header{border-bottom:3px solid #0a7a5a;padding-bottom:16px;margin-bottom:24px;}
          .title{font-size:22px;font-weight:900;color:#0a7a5a;}
          .subtitle{font-size:13px;color:#666;margin-top:4px;}
          .stats{display:flex;gap:16px;margin-bottom:24px;}
          .stat-box{flex:1;background:#f0f9f5;border-radius:10px;padding:14px;text-align:center;}
          .stat-label{font-size:11px;color:#666;margin-bottom:4px;}
          .stat-value{font-size:24px;font-weight:900;color:#0a7a5a;}
          .section{margin-bottom:24px;}
          .section-title{font-size:14px;font-weight:900;color:#0a7a5a;margin-bottom:10px;border-left:4px solid #0a7a5a;padding-left:8px;}
          .record{border:1px solid #ddd;border-radius:8px;padding:10px 14px;margin-bottom:8px;font-size:13px;}
          .record-date{color:#666;font-size:11px;}
          .freq-item{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee;font-size:13px;}
          @media print{@page{margin:14mm;}}
        </style></head><body>
        <div class="header">
          <div class="title">${historyPatient.name} 月次レポート</div>
          <div class="subtitle">${y}年${parseInt(mo)}月 ／ 測定${monthRecords.length}回</div>
        </div>
        <div class="stats">
          <div class="stat-box"><div class="stat-label">平均スコア</div><div class="stat-value">${avgScore!==null?avgScore:"-"}</div></div>
          <div class="stat-box"><div class="stat-label">月初スコア</div><div class="stat-value">${firstScore!==null?firstScore:"-"}</div></div>
          <div class="stat-box"><div class="stat-label">月末スコア</div><div class="stat-value">${lastScore!==null?lastScore:"-"}</div></div>
          <div class="stat-box"><div class="stat-label">変化</div><div class="stat-value">${scoreDelta!==null?(scoreDelta>0?"+":"")+scoreDelta:"-"}</div></div>
        </div>`;
      if (topExercises.length>0) {
        html += `<div class="section"><div class="section-title">よく行った体操</div>`;
        topExercises.forEach(([name,count])=>{
          html += `<div class="freq-item"><span>${name}</span><span>${count}回</span></div>`;
        });
        html += `</div>`;
      }
      if (topIssues.length>0) {
        html += `<div class="section"><div class="section-title">継続して見られた課題</div>`;
        topIssues.forEach(([title,count])=>{
          html += `<div class="freq-item"><span>${title}</span><span>${count}回</span></div>`;
        });
        html += `</div>`;
      }
      html += `<div class="section"><div class="section-title">測定記録一覧</div>`;
      monthRecords.forEach(h=>{
        html += `<div class="record"><div class="record-date">${formatDate(h.date)}　スコア: ${h.score}</div>${h.summary||""}</div>`;
      });
      html += `</div>
        <div style="margin-top:24px;font-size:11px;color:#999;text-align:center;">本レポートはAI歩行解析の参考情報です。医療診断の代替ではありません。</div>
        </body></html>`;
      win.document.open(); win.document.write(html); win.document.close();
      setTimeout(()=>win.print(), 800);
    };

    return (
      <div style={wrap}><GlassOrbs/><ThemeToggle toggleTheme={toggleTheme} theme={theme}/><div style={maxW}>
        <div style={{paddingTop:40,marginBottom:24}}>
          <button onClick={()=>{setPhase("historyList");setReportMonth(null);}} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:13,padding:0,marginBottom:20,fontFamily:C.font}}>← 測定履歴に戻る</button>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div>
              <h2 style={{fontSize:22,fontWeight:900,margin:0,color:C.text}}>{historyPatient.name} の月次レポート</h2>
              <p style={{color:C.muted,fontSize:13,marginTop:4}}>{y}年{parseInt(mo)}月 ／ 測定{monthRecords.length}回</p>
            </div>
            <button onClick={handlePrintMonthly} style={{padding:"8px 14px",background:`linear-gradient(135deg,${C.accent},${C.accentDim})`,border:"none",borderRadius:8,color:C.bgSolid,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:C.font,whiteSpace:"nowrap"}}>🖨️ 印刷</button>
          </div>
        </div>

        {monthRecords.length===0?(
          <div style={{background:C.surface,border:`${C.borderW} solid ${C.border}`,borderRadius:12,padding:"32px",textAlign:"center",color:C.muted,fontSize:13}}>この月の測定データがありません</div>
        ):(
          <>
            <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap"}}>
              {[
                {label:"平均スコア", value:avgScore},
                {label:"月初スコア", value:firstScore},
                {label:"月末スコア", value:lastScore},
                {label:"変化", value:scoreDelta!==null?(scoreDelta>0?"+":"")+scoreDelta:null},
              ].map((s,i)=>(
                <div key={i} style={{flex:"1 1 120px",background:C.panel,border:`${C.borderW} solid ${C.border}`,borderRadius:12,padding:"14px",textAlign:"center"}}>
                  <div style={{fontSize:11,color:C.muted,marginBottom:6}}>{s.label}</div>
                  <div style={{fontSize:24,fontWeight:900,color:C.accent,fontFamily:"'Space Mono',monospace"}}>{s.value!==null?s.value:"-"}</div>
                </div>
              ))}
            </div>

            {topExercises.length>0&&(
              <div style={{background:C.panel,border:`${C.borderW} solid ${C.border}`,borderRadius:14,padding:"16px 18px",marginBottom:16}}>
                <div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:10}}>よく行った体操</div>
                {topExercises.map(([name,count],i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:i<topExercises.length-1?`1px solid ${C.border}33`:"none",fontSize:13,color:C.text}}>
                    <span>{name}</span><span style={{color:C.muted}}>{count}回</span>
                  </div>
                ))}
              </div>
            )}

            {topIssues.length>0&&(
              <div style={{background:C.panel,border:`${C.borderW} solid ${C.border}`,borderRadius:14,padding:"16px 18px",marginBottom:16}}>
                <div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:10}}>継続して見られた課題</div>
                {topIssues.map(([title,count],i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:i<topIssues.length-1?`1px solid ${C.border}33`:"none",fontSize:13,color:C.text}}>
                    <span>{title}</span><span style={{color:C.muted}}>{count}回</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{background:C.panel,border:`${C.borderW} solid ${C.border}`,borderRadius:14,padding:"16px 18px"}}>
              <div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:10}}>測定記録一覧</div>
              {monthRecords.map((h,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:i<monthRecords.length-1?`${C.borderW} solid ${C.border}`:"none"}}>
                  <div style={{fontSize:11,color:C.muted,width:80,flexShrink:0}}>{formatDate(h.date)}</div>
                  <div style={{fontWeight:700,color:h.score>=75?C.accent:h.score>=50?C.amber:C.red,fontFamily:"'Space Mono',monospace",width:36}}>{h.score}</div>
                  <div style={{fontSize:12,color:C.mutedLight,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.summary}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div></div>
    );
  }

  // ── FACILITY SUMMARY ──────────────────────────────────────────────────────
  if (phase==="facilitySummary" && summaryData) {
    const { month, results } = summaryData;
    const [y, mo] = month.split("-");

    const withData = results.filter(r=>r.monthRecords.length>0);
    const overallAvg = withData.length>0 ? Math.round(withData.reduce((s,r)=>s+r.monthRecords.reduce((s2,h)=>s2+h.score,0)/r.monthRecords.length,0)/withData.length) : null;

    // 利用者ごとの平均・変化量
    const patientStats = withData.map(r=>{
      const sorted = [...r.monthRecords].sort((a,b)=>new Date(a.date)-new Date(b.date));
      const avg = Math.round(sorted.reduce((s,h)=>s+h.score,0)/sorted.length);
      const delta = sorted.length>1 ? sorted[sorted.length-1].score - sorted[0].score : 0;
      const latest = sorted[sorted.length-1];
      return { patient: r.patient, avg, delta, count: sorted.length, latestScore: latest.score };
    }).sort((a,b)=>a.avg-b.avg);

    // アラート対象：スコアが低い（60未満）または大きく低下（-10以上）
    const alerts = patientStats.filter(p=>p.latestScore<60 || p.delta<=-10);

    // 未測定の利用者
    const noData = results.filter(r=>r.monthRecords.length===0).map(r=>r.patient);

    // 施設全体の歩行指標時系列データ
    const getGaitScore = (v) => {
      if (!v) return null;
      const s = String(v);
      if (s==="良好"||s==="正常"||s==="自然") return 85;
      if (s.includes("十分")||s.includes("安定")||s.includes("良く")||s.includes("改善")||s.includes("伸び")) return 80;
      if (s.includes("やや")||s.includes("少し")) return 60;
      if (s.includes("不規則")||s.includes("小さい")||s.includes("少ない")||s.includes("擦る")||s.includes("前かがみ")) return 40;
      return 65;
    };
    const metricKeys = ["cadence","stride","posture","armSwing","footClearance"];
    const metricColors2 = {"cadence":"#39e0b0","stride":"#4da6ff","posture":"#f5a623","armSwing":"#c084fc","footClearance":"#f472b6"};
    const metricLabels2 = {"cadence":"歩行リズム","stride":"歩幅","posture":"体幹・姿勢","armSwing":"腕振り","footClearance":"足の上がり"};
    const dateMap = {};
    withData.forEach(r=>{
      r.monthRecords.forEach(h=>{
        if (!h.gait) return;
        const dk = h.date ? h.date.slice(0,10) : null;
        if (!dk) return;
        if (!dateMap[dk]) dateMap[dk] = {};
        metricKeys.forEach(k=>{
          const sc = getGaitScore(h.gait[k]);
          if (sc===null) return;
          if (!dateMap[dk][k]) dateMap[dk][k] = [];
          dateMap[dk][k].push(sc);
        });
      });
    });
    const sortedDates = Object.keys(dateMap).sort();
    const facilityGaitData = sortedDates.map(date=>{
      const entry = { date };
      metricKeys.forEach(k=>{
        const arr = dateMap[date][k] || [];
        entry[k] = arr.length>0 ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : null;
      });
      return entry;
    });

    return (
      <div style={wrap}><GlassOrbs/><ThemeToggle toggleTheme={toggleTheme} theme={theme}/><div style={maxW}>
        <div style={{paddingTop:40,marginBottom:24}}>
          <button onClick={()=>setPhase("userSelect")} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:13,padding:0,marginBottom:20,fontFamily:C.font}}>← 利用者選択に戻る</button>
          <h2 style={{fontSize:22,fontWeight:900,margin:0,color:C.text}}>施設全体の月次サマリー</h2>
          <p style={{color:C.muted,fontSize:13,marginTop:8}}>{y}年{parseInt(mo)}月 ／ 測定のあった利用者 {withData.length}名 ／ 全{results.length}名</p>
        </div>

        <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap"}}>
          <div style={{flex:"1 1 140px",background:C.panel,border:`${C.borderW} solid ${C.border}`,borderRadius:12,padding:"14px",textAlign:"center"}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:6}}>全体平均スコア</div>
            <div style={{fontSize:28,fontWeight:900,color:C.accent,fontFamily:"'Space Mono',monospace"}}>{overallAvg!==null?overallAvg:"-"}</div>
          </div>
          <div style={{flex:"1 1 140px",background:C.panel,border:`${C.borderW} solid ${C.border}`,borderRadius:12,padding:"14px",textAlign:"center"}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:6}}>要注意の利用者</div>
            <div style={{fontSize:28,fontWeight:900,color:alerts.length>0?C.red:C.accent,fontFamily:"'Space Mono',monospace"}}>{alerts.length}名</div>
          </div>
          <div style={{flex:"1 1 140px",background:C.panel,border:`${C.borderW} solid ${C.border}`,borderRadius:12,padding:"14px",textAlign:"center"}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:6}}>未測定</div>
            <div style={{fontSize:28,fontWeight:900,color:C.amber,fontFamily:"'Space Mono',monospace"}}>{noData.length}名</div>
          </div>
        </div>

        {alerts.length>0&&(
          <div style={{background:C.red+"0f",border:`${C.borderW} solid ${C.red}55`,borderRadius:14,padding:"16px 18px",marginBottom:16}}>
            <div style={{fontSize:11,color:C.red,letterSpacing:2,marginBottom:10,fontWeight:700}}>⚠️ 要注意の利用者</div>
            {alerts.map((a,i)=>(
              <div key={i} onClick={()=>{setHistoryPatient({id:a.patient.id,name:a.patient.name,history:results.find(r=>r.patient.id===a.patient.id).allHistory});setPhase("historyList");}} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:i<alerts.length-1?`1px solid ${C.red}33`:"none",cursor:"pointer"}}>
                <span style={{fontSize:14,fontWeight:700,color:C.text}}>{a.patient.name}</span>
                <div style={{display:"flex",gap:10,alignItems:"center"}}>
                  <span style={{fontSize:12,color:C.muted}}>最新: {a.latestScore}</span>
                  {a.delta!==0&&<span style={{fontSize:12,fontWeight:700,color:a.delta<0?C.red:C.accent}}>{a.delta>0?"+":""}{a.delta}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {facilityGaitData.length>1&&(()=>{
          const cW=280, cH=100, pad=20;
          return (
            <div style={{background:C.panel,border:`${C.borderW} solid ${C.border}`,borderRadius:14,padding:"16px 18px",marginBottom:16}}>
              <div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:10}}>施設全体 歩行指標の推移（平均）</div>
              <svg width="100%" viewBox={`0 0 ${cW} ${cH}`} style={{overflow:"visible"}}>
                {[40,60,80].map(v=>{
                  const y=cH-pad-((v-20)/(100-20))*(cH-pad*2);
                  return <line key={v} x1={pad} y1={y} x2={cW-pad} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1"/>;
                })}
                {metricKeys.map((k,mi)=>{
                  const pts = facilityGaitData.map((d,i)=>({
                    x: pad+(i/(facilityGaitData.length-1))*(cW-pad*2),
                    y: d[k]!==null ? cH-pad-((d[k]-20)/(100-20))*(cH-pad*2) : null,
                  })).filter(p=>p.y!==null);
                  if (pts.length<2) return null;
                  const pathD = pts.map((p,i)=>`${i===0?"M":"L"} ${p.x} ${p.y}`).join(" ");
                  return (
                    <g key={k}>
                      <path d={pathD} fill="none" stroke={metricColors2[k]} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.85"/>
                      {pts.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={3} fill={metricColors2[k]} stroke="rgba(10,15,30,1)" strokeWidth={1.5}/>)}
                    </g>
                  );
                })}
                {facilityGaitData.map((d,i)=>{
                  const x=pad+(i/(facilityGaitData.length-1))*(cW-pad*2);
                  const dt=new Date(d.date);
                  return <text key={i} x={x} y={cH-4} textAnchor="middle" fontSize="7" fill="rgba(255,255,255,0.35)">{`${dt.getMonth()+1}/${dt.getDate()}`}</text>;
                })}
              </svg>
              <div style={{display:"flex",flexWrap:"wrap",gap:"6px 12px",marginTop:8}}>
                {metricKeys.map(k=>(
                  <div key={k} style={{display:"flex",alignItems:"center",gap:4}}>
                    <div style={{width:16,height:3,borderRadius:2,background:metricColors2[k]}}/>
                    <span style={{fontSize:10,color:"rgba(255,255,255,0.5)"}}>{metricLabels2[k]}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {patientStats.length>0&&(
          <div style={{background:C.panel,border:`${C.borderW} solid ${C.border}`,borderRadius:14,padding:"16px 18px",marginBottom:16}}>
            <div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:10}}>全利用者の平均スコア</div>
            {patientStats.map((p,i)=>(
              <div key={i} onClick={()=>{setHistoryPatient({id:p.patient.id,name:p.patient.name,history:results.find(r=>r.patient.id===p.patient.id).allHistory});setPhase("historyList");}} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:i<patientStats.length-1?`${C.borderW} solid ${C.border}`:"none",cursor:"pointer"}}>
                <span style={{fontSize:13,color:C.text}}>{p.patient.name}</span>
                <div style={{display:"flex",gap:10,alignItems:"center"}}>
                  <span style={{fontSize:11,color:C.muted}}>{p.count}回測定</span>
                  <span style={{fontWeight:700,color:p.avg>=75?C.accent:p.avg>=50?C.amber:C.red,fontFamily:"'Space Mono',monospace",width:30,textAlign:"right"}}>{p.avg}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {noData.length>0&&(
          <div style={{background:C.panel,border:`${C.borderW} solid ${C.border}`,borderRadius:14,padding:"16px 18px"}}>
            <div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:10}}>今月まだ測定がない利用者</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
              {noData.map((p,i)=>(
                <span key={i} style={{fontSize:12,color:C.mutedLight,background:C.surface,borderRadius:100,padding:"4px 12px"}}>{p.name}</span>
              ))}
            </div>
          </div>
        )}
      </div></div>
    );
  }

  // ── USER SELECT ───────────────────────────────────────────────────────────
  if (phase==="userSelect") {
    const addNew = async () => {
      if (!nameInput.trim()) return;
      // 重複チェック（名前＋ふりがなが両方一致する場合）
      const dup = patients.find(p =>
        p.name === nameInput.trim() && p.furigana === furiganaInput.trim()
      );
      if (dup) { setError(`「${nameInput.trim()}」さんはすでに登録されています。`); return; }
      const newPatient = await createPatient(effectiveFacilityId, nameInput.trim(), furiganaInput.trim(), ageGroupInput);
      if (!newPatient) { setError("登録に失敗しました。再度お試しください。"); return; }
      setPatientId(newPatient.id); setPatientName(newPatient.name); setPatientAgeGroup(newPatient.age_group || ""); setPatientHistory([]); setNameInput(""); setFuriganaInput(""); setAgeGroupInput(""); setSearchQuery("");
      await loadPatients(effectiveFacilityId); setPhase("upload");
    };

    // 検索フィルター（名前・ふりがな両方）
    const filtered = patients.filter(p => {
      const q = searchQuery.trim().toLowerCase();
      if (!q) return false;
      return (p.name||"").toLowerCase().includes(q) || (p.furigana||"").toLowerCase().includes(q);
    });

    return (
      <div style={wrap}><GlassOrbs/><ThemeToggle toggleTheme={toggleTheme} theme={theme}/><div style={maxW}>
        <DeleteDialog
          confirm={deleteConfirm}
          onCancel={() => setDeleteConfirm(null)}
          onConfirm={handleDeleteConfirm}
          C={C}
        />
        <StaffManager
          show={showStaffManager}
          onClose={() => setShowStaffManager(false)}
          theme={theme}
          C={C}
          alertThreshold={alertThreshold}
          setAlertThreshold={setAlertThreshold}
          noMeasurementDays={noMeasurementDays}
          setNoMeasurementDays={setNoMeasurementDays}
          myRole={myRole}
          staffs={staffs}
          session={session}
          loadStaffs={loadStaffs}
        />
        <div style={{paddingTop:40,marginBottom:28}}>
          <button onClick={()=>setPhase("consent")} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:13,padding:0,marginBottom:20,fontFamily:C.font}}>← 同意画面に戻る</button>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
            <div>
              <h2 style={{fontSize:22,fontWeight:900,margin:0,color:C.text}}>利用者を選択</h2>
              <p style={{color:C.muted,fontSize:13,marginTop:8}}>初回の方は新規登録、2回目以降の方は名前を選んでください</p>
            </div>
            {patients.length>0&&<button disabled={summaryLoading} onClick={async()=>{
              setSummaryLoading(true);
              const allResults = await Promise.all(patients.map(async p=>{
                const hist = await getPatientHistory(p.id);
                return { patient: p, allHistory: hist };
              }));
              setSummaryAllData(allResults);
              setSummaryLoading(false);
              setShowSummaryMonthPicker(true);
            }} style={{padding:"8px 14px",background:C.surface,border:`${C.borderW} solid ${C.border}`,borderRadius:8,color:C.mutedLight,fontSize:12,fontWeight:700,cursor:summaryLoading?"default":"pointer",fontFamily:C.font,whiteSpace:"nowrap"}}>{summaryLoading?"読み込み中...":"📊 月次サマリー"}</button>}
          </div>
          {showSummaryMonthPicker&&summaryAllData&&(()=>{
            const monthSet = new Set();
            summaryAllData.forEach(r=>r.allHistory.forEach(h=>{
              const d = new Date(h.date);
              monthSet.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`);
            }));
            const months = Array.from(monthSet).sort().reverse();
            return (
              <div onClick={()=>setShowSummaryMonthPicker(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:20}}>
                <div onClick={e=>e.stopPropagation()} style={{background:C.bgSolid,border:`${C.borderW} solid ${C.border}`,borderRadius:14,padding:"20px",maxWidth:340,width:"100%",maxHeight:"70vh",overflowY:"auto"}}>
                  <div style={{fontSize:15,fontWeight:900,color:C.text,marginBottom:14}}>📅 対象月を選択</div>
                  {months.length===0?(
                    <div style={{color:C.muted,fontSize:13,textAlign:"center",padding:"20px 0"}}>測定データがありません</div>
                  ):(
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {months.map(m=>{
                        const [y,mo]=m.split("-");
                        return (
                          <button key={m} onClick={()=>{
                            const results = summaryAllData.map(r=>{
                              const monthRecords = r.allHistory.filter(h=>{
                                const d = new Date(h.date);
                                return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}` === m;
                              });
                              return { patient: r.patient, monthRecords, allHistory: r.allHistory };
                            });
                            setSummaryData({ month: m, results });
                            setShowSummaryMonthPicker(false);
                            setPhase("facilitySummary");
                          }} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",background:C.surface,border:`${C.borderW} solid ${C.border}`,borderRadius:10,color:C.text,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:C.font,textAlign:"left"}}>
                            <span>{y}年{parseInt(mo)}月</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <button onClick={()=>setShowSummaryMonthPicker(false)} style={{marginTop:14,width:"100%",padding:"10px",background:"none",border:"none",color:C.muted,fontSize:13,cursor:"pointer",fontFamily:C.font}}>キャンセル</button>
                </div>
              </div>
            );
          })()}
        </div>
        {error&&<div style={{background:C.red+"18",border:`1px solid ${C.red}33`,borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:13,color:C.red}}>⚠️ {error}</div>}

        {/* 検索ボックス */}
        {patients.length>0&&(
          <div style={{marginBottom:16}}>
            <div style={{position:"relative"}}>
              <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:15,color:C.muted}}>🔍</span>
              <input
                value={searchQuery}
                onChange={e=>{setSearchQuery(e.target.value);setError(null);}}
                placeholder="名前・ふりがなで検索..."
                style={{width:"100%",boxSizing:"border-box",background:C.surface,border:`${C.borderW} solid ${C.border}`,borderRadius:10,padding:"11px 12px 11px 36px",color:C.text,fontSize:13,fontFamily:C.font,outline:"none"}}
              />
              {searchQuery&&<button onClick={()=>setSearchQuery("")} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:16,lineHeight:1}}>×</button>}
            </div>
          </div>
        )}

        {/* 登録済み利用者一覧 */}
        {patients.length>0&&(
          <div style={{marginBottom:20}}>
            <div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:10}}>
              登録済み利用者
              {searchQuery&&<span style={{marginLeft:8,color:C.accent}}>{filtered.length}件ヒット</span>}
            </div>
            {filtered.length===0?(
              <div style={{background:C.surface,border:`${C.borderW} solid ${C.border}`,borderRadius:10,padding:"20px",textAlign:"center",color:C.muted,fontSize:13}}>
                「{searchQuery}」に一致する利用者が見つかりません
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {filtered.map(p=>{
                  const hist=p.history||[], last=hist[0];
const prev=hist[1];
const isAlert = last && prev && (prev.score - last.score) >= alertThreshold;const daysSinceLastMeasurement = last ? Math.floor((new Date() - new Date(last.date)) / (1000*60*60*24)) : null;
const isOverdue = daysSinceLastMeasurement !== null && daysSinceLastMeasurement >= noMeasurementDays;
                  return (
                    <div key={p.id} style={{background:isAlert?`rgba(255,77,109,0.08)`:isOverdue?`rgba(245,166,35,0.08)`:C.surface,border:`${C.borderW} solid ${isAlert?C.red:isOverdue?C.amber:C.border}`,borderRadius:12,padding:"14px 16px",transition:"all 0.15s"}}>
                      <div style={{display:"flex",alignItems:"center",gap:12}} onClick={()=>{setHistoryPatient(p);setPhase("historyList");getPatientNotes(p.id).then(setPatientNotes);setShareToken(null);setShareCopied(false);getShareToken(p.id).then(setShareToken);}}>
                        <div style={{width:40,height:40,borderRadius:"50%",background:C.panel,border:`2px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0,cursor:"pointer"}}>👤</div>
                        <div style={{flex:1,minWidth:0,cursor:"pointer"}}>
                          <div style={{fontWeight:700,fontSize:15,color:C.text}}>{p.name}</div>
                          {p.furigana&&<div style={{fontSize:11,color:C.accent,marginTop:1}}>{p.furigana}</div>}
                          <div style={{fontSize:11,color:C.muted,marginTop:2}}>{hist.length>0?`${hist.length}回測定済み ／ 最終: ${formatDate(last.date)} ／ スコア: ${last.score}`:"測定歴なし"}</div>
                        </div>
                        <div style={{color:C.muted,fontSize:16,cursor:"pointer"}}>›</div>
                      </div>
                      <div style={{display:"flex",gap:8,marginTop:10,paddingTop:10,borderTop:`${C.borderW} solid ${C.border}`}}>
                        {myRole==="admin"&&<button onClick={e=>{e.stopPropagation();setDeleteConfirm({id:p.id,name:p.name,type:"history"});}} style={{flex:1,padding:"7px",background:"transparent",border:`1px solid ${C.amber}44`,borderRadius:8,color:C.amber,fontSize:11,cursor:"pointer",fontFamily:C.font}}>📋 履歴を削除</button>}
{myRole==="admin"&&<button onClick={e=>{e.stopPropagation();setDeleteConfirm({id:p.id,name:p.name,type:"patient"});}} style={{flex:1,padding:"7px",background:"transparent",border:`1px solid ${C.red}44`,borderRadius:8,color:C.red,fontSize:11,cursor:"pointer",fontFamily:C.font}}>🗑️ 利用者を削除</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 新規登録 */}
        <div style={{background:C.amber+"12",border:`${C.borderW} solid ${C.amber}44`,borderRadius:12,padding:"16px",marginBottom:16}}>
          <div style={{fontSize:11,color:C.amber,letterSpacing:2,marginBottom:12,fontWeight:700}}>⚡ クイック解析（匿名・履歴なし）</div>
          <div style={{fontSize:12,color:C.mutedLight,marginBottom:12,lineHeight:1.7}}>利用者登録不要で1回だけ解析できます。結果はDBに保存されません。</div>
          <button onClick={()=>{setIsQuick(true);setPatientId(null);setPatientName("匿名");setPatientHistory([]);setPhase("upload");}} style={{width:"100%",padding:"11px",background:`linear-gradient(135deg,${C.amber},#e8821a)`,border:"none",borderRadius:8,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:C.font}}>⚡ クイック解析を開始</button>
        </div>
        <div style={{background:C.surface,border:`${C.borderW} solid ${C.border}`,borderRadius:12,padding:"16px"}}>
          <div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:12}}>新規登録</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <input
              value={furiganaInput}
              onChange={e=>setFuriganaInput(e.target.value)}
              placeholder="ふりがな（例：たなかよしこ）"
              style={{background:C.panel,border:`${C.borderW} solid ${C.border}`,borderRadius:8,padding:"10px 12px",color:C.text,fontSize:13,fontFamily:C.font,outline:"none"}}
            />
<select
              value={ageGroupInput}
              onChange={e=>setAgeGroupInput(e.target.value)}
              style={{background:C.panel,border:`${C.borderW} solid ${C.border}`,borderRadius:8,padding:"10px 12px",color:C.text,fontSize:13,fontFamily:C.font,outline:"none"}}
            >
              <option value="">年代を選択（任意）</option>
              <option value="60代未満">60代未満</option>
              <option value="60代">60代</option>
              <option value="70代">70代</option>
              <option value="80代">80代</option>
              <option value="90代以上">90代以上</option>
            </select>
            <div style={{display:"flex",gap:8}}>
              <input
                value={nameInput}
                onChange={e=>setNameInput(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter"&&!e.isComposing&&e.keyCode!==229)addNew()}}
                placeholder="お名前（例：田中様）"
                style={{flex:1,background:C.panel,border:`${C.borderW} solid ${C.border}`,borderRadius:8,padding:"10px 12px",color:C.text,fontSize:13,fontFamily:C.font,outline:"none"}}
              />
              <button
                onClick={addNew}
                disabled={!nameInput.trim()}
                style={{padding:"10px 16px",background:nameInput.trim()?C.accent:C.border,border:"none",borderRadius:8,color:nameInput.trim()?C.bgSolid:C.muted,fontSize:13,fontWeight:700,cursor:nameInput.trim()?"pointer":"not-allowed",fontFamily:C.font,whiteSpace:"nowrap"}}
              >登録して開始</button>
            </div>
            <div style={{fontSize:11,color:C.muted,lineHeight:1.6}}>※ ふりがなは任意ですが、同姓同名の重複防止に役立ちます</div>
          </div>
        </div>
      </div></div>
    );
  }

  // ── UPLOAD ────────────────────────────────────────────────────────────────
  if (phase==="upload") {
    return (
      <div style={wrap}><GlassOrbs/><ThemeToggle toggleTheme={toggleTheme} theme={theme}/><div style={maxW}>
        <div style={{paddingTop:40,marginBottom:20}}>
          <button onClick={()=>setPhase("userSelect")} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:13,padding:0,marginBottom:16,fontFamily:C.font}}>← 利用者選択に戻る</button>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:36,height:36,borderRadius:"50%",background:C.accent+"1a",border:`1px solid ${C.accent}33`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>👤</div>
            <div><div style={{fontWeight:700,fontSize:15}}>{patientName}</div><div style={{fontSize:11,color:C.muted}}>{patientHistory.length>0?`${patientHistory.length+1}回目の測定`:"初回測定"}</div></div>
          </div>
        </div>
        {error&&<div style={{background:C.red+"18",border:`1px solid ${C.red}33`,borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:13,color:C.red}}>⚠️ {error}</div>}
        <input ref={fileInputRef} type="file" accept="video/*" style={{display:"none"}} onChange={e=>{if(e.target.files[0])handleFile(e.target.files[0]);e.target.value="";}}/>
        {!videoUrl?(
          <div onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={handleDrop} onClick={()=>fileInputRef.current?.click()} style={{border:`2px dashed ${dragOver?C.accent:C.border}`,borderRadius:16,padding:"44px 24px",textAlign:"center",cursor:"pointer",background:dragOver?C.accent+"06":C.surface,transition:"all 0.2s"}}>
            <div style={{fontSize:48,marginBottom:12}}>🎥</div>
            <div style={{fontWeight:700,fontSize:15,marginBottom:6}}>動画をドロップ、またはタップして選択</div>
            <div style={{color:C.muted,fontSize:12}}>MP4 / MOV / WebM ／ 最大200MB</div>
          </div>
        ):(
          <div>
            <div style={{position:"relative",width:"100%"}}>
            <video ref={videoRef} src={videoUrl} controls playsInline style={{width:"100%",borderRadius:12,background:"#000",maxHeight:320,border:`${C.borderW} solid ${C.border}`}}/>
            {showTapGuide&&(
              <div
                onClick={e=>{
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = (e.clientX - rect.left) / rect.width;
                  setTapTargetX(x); tapTargetXRef.current = x;
                }}
                style={{position:"absolute",inset:0,borderRadius:12,cursor:"crosshair",background:"rgba(0,0,0,0.35)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}
              >
                {tapTargetX===null?(
                  <div style={{textAlign:"center",pointerEvents:"none"}}>
                    <div style={{fontSize:36,marginBottom:8}}>👆</div>
                    <div style={{fontSize:14,fontWeight:700,color:"#fff",marginBottom:4}}>被解析者をタップしてください</div>
                    <div style={{fontSize:11,color:"rgba(255,255,255,0.7)"}}>タップした人物を中心に解析します</div>
                  </div>
                ):(
                  <>
                    <div style={{position:"absolute",top:0,bottom:0,left:`${Math.max(0,(tapTargetX-0.2)*100)}%`,width:"40%",border:`3px solid ${C.accent}`,borderRadius:8,background:`${C.accent}15`,pointerEvents:"none"}}/>
                    <div style={{position:"absolute",top:"50%",left:`${tapTargetX*100}%`,transform:"translate(-50%,-50%)",width:40,height:40,borderRadius:"50%",border:`3px solid ${C.accent}`,background:`${C.accent}33`,pointerEvents:"none",boxShadow:`0 0 20px ${C.accent}`}}/>
                    <div style={{position:"absolute",bottom:12,left:0,right:0,textAlign:"center",pointerEvents:"none"}}>
                      <div style={{fontSize:12,color:"#fff",background:"rgba(0,0,0,0.6)",borderRadius:8,padding:"4px 12px",display:"inline-block"}}>✅ タップ位置を確認してください。ずれていたら再タップできます</div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
            <div style={{background:C.surface,border:`${C.borderW} solid ${C.border}`,borderRadius:12,padding:"14px 16px",marginTop:12}}>
              <div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:10,fontWeight:700}}>解析前チェック</div>
              {[["スマホを固定して撮影した（横に動かして追いかけていない）",true],["真横から全身が映っている",true],["明るさは十分で影が少ない",false]].map(([label,imp])=>(
                <div key={label} style={{display:"flex",gap:8,alignItems:"flex-start",marginBottom:7}}>
                  <span style={{width:16,height:16,borderRadius:4,marginTop:1,flexShrink:0,border:`${C.borderW} solid ${imp?C.amber:C.border}`}}/>
                  <span style={{fontSize:12,color:imp?C.text:C.mutedLight,fontWeight:imp?600:400,lineHeight:1.5}}>{imp&&<span style={{color:C.amber,marginRight:3}}>★</span>}{label}</span>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:10,marginTop:12}}>
              <button onClick={()=>{URL.revokeObjectURL(videoUrl);setVideoUrl(null);setTapTargetX(null);tapTargetXRef.current = null;setShowTapGuide(false);}} style={{flex:1,padding:"11px",background:"transparent",border:`${C.borderW} solid ${C.border}`,borderRadius:10,color:C.muted,fontSize:13,cursor:"pointer",fontFamily:C.font}}>動画を変更</button>
              {!showTapGuide?(
                <button onClick={()=>setShowTapGuide(true)} style={{flex:2,padding:"11px",background:`linear-gradient(135deg,${C.accent},${C.accentDim})`,border:"none",borderRadius:10,color:C.bgSolid,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:C.font,boxShadow:`0 4px 20px ${C.accent}33`}}>👆 被解析者を選択 →</button>
              ):(
                <button onClick={startAnalysis} disabled={tapTargetX===null} style={{flex:2,padding:"11px",background:tapTargetX!==null?`linear-gradient(135deg,${C.accent},${C.accentDim})`:"rgba(255,255,255,0.1)",border:"none",borderRadius:10,color:tapTargetX!==null?C.bgSolid:C.muted,fontSize:14,fontWeight:700,cursor:tapTargetX!==null?"pointer":"not-allowed",fontFamily:C.font,boxShadow:tapTargetX!==null?`0 4px 20px ${C.accent}33`:"none"}}>
                  {tapTargetX===null?"被解析者をタップしてください":"解析を開始 →"}
                </button>
              )}
            </div>
          </div>
        )}
        <div style={{marginTop:24}}>
          <div style={{fontSize:11,color:C.muted,letterSpacing:2,fontWeight:700,marginBottom:10}}>📋 撮影ガイド</div>
          <div style={{background:C.amber+"12",border:`${C.borderW} solid ${C.amber}44`,borderRadius:12,padding:"12px 14px",marginBottom:10}}>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}><span style={{fontSize:18,flexShrink:0}}>⚠️</span><div style={{fontSize:12,color:C.mutedLight,lineHeight:1.7}}>スマホを横に動かしながら撮ると解析精度が下がります。<br/><span style={{color:C.text,fontWeight:600}}>スマホを固定して、人が画面を横切るのを待つ</span>のがコツです。</div></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div style={{background:C.red+"0e",border:`1px solid ${C.red}33`,borderRadius:10,padding:"12px"}}><div style={{fontSize:11,fontWeight:700,color:C.red,marginBottom:6}}>✗ NG</div>{["スマホを横に動かして人を追う","斜め前・後ろから撮影","近すぎて全身が入らない"].map(t=><div key={t} style={{fontSize:11,color:C.mutedLight,lineHeight:1.7}}>• {t}</div>)}</div>
            <div style={{background:C.accent+"0e",border:`1px solid ${C.accent}33`,borderRadius:10,padding:"12px"}}><div style={{fontSize:11,fontWeight:700,color:C.accent,marginBottom:6}}>✓ OK</div>{["壁や棚にスマホを立てかける","真横から全身を収める","5〜8m離れて広めに構える"].map(t=><div key={t} style={{fontSize:11,color:C.mutedLight,lineHeight:1.7}}>• {t}</div>)}</div>
          </div>
        </div>
      </div></div>
    );
  }

  // ── EXTRACTING / ANALYZING ────────────────────────────────────────────────
  if (phase==="extracting"||phase==="analyzing") return (
    <div style={{...wrap,justifyContent:"center"}}><div style={{...maxW,textAlign:"center",paddingTop:60}}>
      <div style={{position:"relative",width:120,height:120,margin:"0 auto 28px"}}>
        <svg width="120" height="120" style={{transform:"rotate(-90deg)",position:"absolute",top:0,left:0,right:0,bottom:0}}><circle cx="60" cy="60" r="50" fill="none" stroke={C.border} strokeWidth="6"/><circle cx="60" cy="60" r="50" fill="none" stroke={C.accent} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(progress/100)*314} 314`} style={{transition:"stroke-dasharray 0.5s ease"}}/></svg>
        <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:22,fontWeight:800,color:C.accent,fontFamily:"'Space Mono',monospace"}}>{progress}%</span></div>
      </div>
      {frames.length>0&&(<div style={{marginBottom:20,display:"flex",gap:6,justifyContent:"center",flexWrap:"wrap"}}>{frames.map((f,i)=>(<div key={i} style={{border:`1px solid ${C.accent}55`,borderRadius:6,overflow:"hidden"}}><img src={`data:image/jpeg;base64,${f.b64}`} alt="" style={{display:"block",width:64,height:42,objectFit:"cover"}}/></div>))}</div>)}
      <div style={{fontSize:17,fontWeight:700,marginBottom:8}}>{progressLabel}</div>
      <div style={{color:C.muted,fontSize:13}}>{phase==="extracting"?`${frames.length} フレーム抽出済み`:"AIが歩行パターンを評価中..."}</div>
    </div></div>
  );

  // ── RESULT ────────────────────────────────────────────────────────────────
  if (phase==="result" && result) {
    const prevRecord = patientHistory.length>1 ? patientHistory[1] : null;
    const tabs = [...(patientHistory.length>1?[{id:"compare",label:"比較",icon:"📈"}]:[]),{id:"gait",label:"歩行指標",icon:"📊"},{id:"issues",label:"課題",icon:"⚠️"},{id:"exercises",label:"体操",icon:"🏃"},{id:"lifestyle",label:"生活",icon:"💡"}];
    const handleResultPrint = () => {
      const html = buildPrintHTML({
        patientName,
        measureNo: patientHistory.length,
        dateStr: formatDate(patientHistory[0]?.date),
        result,
      });
      openPrintWindow(html);
    };
    return (
      <div style={wrap}><GlassOrbs/><ThemeToggle toggleTheme={toggleTheme} theme={theme}/><div style={maxW}><div style={{paddingTop:32}}>
        {/* ヘッダー：測定履歴へ戻るボタン追加 */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:28,height:28,borderRadius:"50%",background:C.accent+"1a",border:`1px solid ${C.accent}33`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>👤</div>
            <span style={{fontWeight:700,color:C.text}}>{patientName}</span>
            <span style={{fontSize:11,color:C.muted}}>— {patientHistory.length}回目 / {formatDate(patientHistory[0]?.date)}</span>
          </div>
          <div style={{display:"flex",gap:6}}>
            <button
              onClick={()=>{setHistoryPatient({id:patientId,name:patientName,history:patientHistory});setPhase("historyList");}}
              style={{padding:"6px 12px",background:C.surface,border:`${C.borderW} solid ${C.border}`,borderRadius:8,color:C.mutedLight,fontSize:12,cursor:"pointer",fontFamily:C.font,whiteSpace:"nowrap"}}
            >📋 測定履歴</button>
            <button
              onClick={()=>{setPhase("userSelect");}}
              style={{padding:"6px 12px",background:C.surface,border:`${C.borderW} solid ${C.border}`,borderRadius:8,color:C.mutedLight,fontSize:12,cursor:"pointer",fontFamily:C.font,whiteSpace:"nowrap"}}
            >👤 利用者選択</button>
          </div>
        </div>

        <div style={{background:C.surface,border:`${C.borderW} solid ${C.border}`,borderRadius:20,padding:"28px 20px",marginBottom:12,display:"flex",flexDirection:"column",alignItems:"center"}}>
          <ScoreArc score={result.score}/>
          <div style={{fontWeight:900,fontSize:17,marginTop:4,textAlign:"center"}}>{result.summary}</div>
          {patientHistory.length>1&&<ScoreHistoryChart history={patientHistory}/>}
        </div>
        {frames.length>0&&(<div style={{background:C.surface,border:`${C.borderW} solid ${C.border}`,borderRadius:14,padding:"12px",marginBottom:12}}><div style={{fontSize:11,color:C.muted,marginBottom:8,letterSpacing:1}}>解析フレーム</div><FrameStrip frames={frames} current={currentFrame} onSelect={setCurrentFrame}/><img src={`data:image/jpeg;base64,${frames[currentFrame]?.b64}`} alt="selected" style={{width:"100%",borderRadius:8,marginTop:4,border:`${C.borderW} solid ${C.border}`}}/></div>)}
        <div style={{display:"flex",gap:4,marginBottom:12,background:C.surface,border:`${C.borderW} solid ${C.border}`,borderRadius:12,padding:4}}>
          {tabs.map(t=>(<button key={t.id} onClick={()=>setActiveTab(t.id)} style={{flex:1,padding:"8px 2px",background:activeTab===t.id?C.accent:"transparent",border:"none",borderRadius:8,color:activeTab===t.id?C.bgSolid:C.muted,fontSize:10,fontWeight:700,cursor:"pointer",transition:"all 0.2s",fontFamily:C.font,lineHeight:1.4}}>{t.icon}<br/>{t.label}</button>))}
        </div>
        {activeTab==="compare"&&(<div><ComparePanel current={result} prev={prevRecord}/>
        {patientHistory.length>1&&(<div style={{background:C.panel,border:`${C.borderW} solid ${C.border}`,borderRadius:14,padding:"16px 18px",marginBottom:10}}><div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:4}}>歩行指標の推移</div><GaitMetricsHistoryChart history={patientHistory}/></div>)}{patientHistory.length>2&&(<div style={{background:C.panel,border:`${C.borderW} solid ${C.border}`,borderRadius:14,padding:"16px 18px"}}><div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:10}}>測定履歴</div>{patientHistory.slice(0,5).map((h,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:i<Math.min(patientHistory.length,5)-1?`${C.borderW} solid ${C.border}`:"none"}}><div style={{fontSize:11,color:C.muted,width:80,flexShrink:0}}>{formatDate(h.date)}</div><div style={{fontWeight:700,color:h.score>=75?C.accent:h.score>=50?C.amber:C.red,fontFamily:"'Space Mono',monospace",width:36}}>{h.score}</div><div style={{fontSize:12,color:C.mutedLight,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.summary}</div></div>))}</div>)}</div>)}
        {activeTab==="gait"&&result.gait&&(<div>{result.aids&&(<div style={{background:C.panel,border:`${C.borderW} solid ${C.border}`,borderRadius:14,padding:"16px 18px",marginBottom:10}}><div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:12}}>補助具・手すり</div><div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:result.aids.usage||result.aids.recommendation?12:0}}>{result.aids.detected&&result.aids.detected.length>0?result.aids.detected.map((a,i)=><span key={i} style={{background:C.blue+"1a",border:`1px solid ${C.blue}44`,color:C.blue,borderRadius:100,padding:"4px 12px",fontSize:12,fontWeight:700}}>🦯 {fixTerms(a)}</span>):<span style={{background:C.accent+"1a",border:`1px solid ${C.accent}33`,color:C.accent,borderRadius:100,padding:"4px 12px",fontSize:12,fontWeight:700}}>✓ 補助具なし</span>}</div>{result.aids.usage&&<div style={{background:C.surface,borderRadius:8,padding:"10px 12px",fontSize:12,color:C.text,lineHeight:1.6,marginBottom:8,borderLeft:`3px solid ${C.blue}`}}><span style={{color:C.mutedLight,fontSize:11,display:"block",marginBottom:3}}>使い方の評価</span>{fixTerms(result.aids.usage)}</div>}{result.aids.recommendation&&<div style={{background:C.amber+"0f",borderRadius:8,padding:"10px 12px",fontSize:12,color:C.text,lineHeight:1.6,borderLeft:`3px solid ${C.amber}`}}><span style={{color:C.amber,fontSize:11,display:"block",marginBottom:3}}>💡 アドバイス</span>{fixTerms(result.aids.recommendation)}</div>}</div>)}{result.gait.speed&&<div style={{background:C.panel,border:`${C.borderW} solid ${C.border}`,borderRadius:14,padding:"16px 18px",marginBottom:10}}><div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:10}}>歩行速度</div><div style={{fontSize:28,fontWeight:900,color:C.accent,fontFamily:"'Space Mono',monospace"}}>{result.gait.speed}</div>{result.gait.speedComment&&<div style={{marginTop:8,fontSize:13,color:C.text,lineHeight:1.6}}>{result.gait.speedComment}</div>}</div>}<div style={{background:C.panel,border:`${C.borderW} solid ${C.border}`,borderRadius:14,padding:"20px 18px"}}><div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:16}}>GAIT METRICS</div><GaitRadarChart gait={result.gait}/></div></div>)}
        {activeTab==="issues"&&(<div style={{display:"flex",flexDirection:"column",gap:8}}>{(result.issues||[]).map((issue,i)=>(<div key={i} style={{background:C.panel,border:`${C.borderW} solid ${C.border}`,borderRadius:12,padding:"14px 16px"}}><div style={{display:"flex",alignItems:"flex-start",gap:4,marginBottom:6}}><SeverityDot s={issue.severity}/><span style={{fontWeight:700,fontSize:14}}>{issue.title}</span></div><p style={{margin:0,fontSize:13,color:C.mutedLight,lineHeight:1.65,paddingLeft:13}}>{issue.detail}</p></div>))}</div>)}
        {activeTab==="exercises"&&(<div>{patientHistory.length>1&&<div style={{fontSize:11,color:C.muted,marginBottom:10,background:C.panel,border:`${C.borderW} solid ${C.border}`,borderRadius:8,padding:"8px 12px"}}>💬 前回の体操履歴をもとに進捗に合わせた内容を提案しています</div>}{(result.exercises||[]).map((ex,i)=><ExerciseCard key={i} ex={ex} idx={i}/>)}</div>)}
        {activeTab==="lifestyle"&&(<div style={{display:"flex",flexDirection:"column",gap:8}}>{(result.lifestyle||[]).map((tip,i)=>(<div key={i} style={{display:"flex",gap:12,alignItems:"flex-start",background:C.panel,border:`${C.borderW} solid ${C.border}`,borderRadius:12,padding:"14px 16px"}}><span style={{width:26,height:26,borderRadius:8,background:C.accent+"1a",color:C.accent,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:12,flexShrink:0}}>{i+1}</span><p style={{margin:0,fontSize:13,color:C.text,lineHeight:1.7}}>{tip}</p></div>))}</div>)}
        <div style={{display:"flex",gap:10,marginTop:20}}>
          <button onClick={handleResultPrint} style={{flex:1,padding:"13px",background:`linear-gradient(135deg,${C.accent},${C.accentDim})`,border:"none",borderRadius:12,color:C.bgSolid,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:C.font,boxShadow:`0 4px 20px ${C.accent}33`}}>🖨️ 印刷 / PDF保存</button>
        </div>
        <button onClick={restart} style={{width:"100%",marginTop:10,padding:"13px",background:"transparent",border:`${C.borderW} solid ${C.border}`,borderRadius:12,color:C.muted,fontSize:14,cursor:"pointer",fontFamily:C.font}}>別の動画で再解析</button>
      </div></div></div>
    );
  }

  // ── LOADING ───────────────────────────────────────────────────────────────
  if (phase==="loading") return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
      <GlassOrbs/><ThemeToggle toggleTheme={toggleTheme} theme={theme}/>
      <div style={{color:C.accent,fontSize:16,fontFamily:C.font,position:"relative",zIndex:1}}>読み込み中...</div>
    </div>
  );
  return null;
}

function ShareGaitChart({ history }) {
  if (!history || history.length < 2) return null;
  const items = [...history].reverse().slice(-8);
  const getScore = (v) => {
    if (!v) return 65;
    const s = String(v);
    if (s==="良好"||s==="正常"||s==="自然") return 85;
    if (s.includes("十分")||s.includes("安定")||s.includes("良く")||s.includes("改善")||s.includes("伸び")) return 80;
    if (s.includes("やや")||s.includes("少し")) return 60;
    if (s.includes("不規則")||s.includes("小さい")||s.includes("少ない")||s.includes("擦る")||s.includes("前かがみ")) return 40;
    return 65;
  };
  const metrics = [
    { key:"cadence", label:"歩行リズム", color:"#39e0b0" },
    { key:"stride",  label:"歩幅",       color:"#4da6ff" },
    { key:"posture", label:"体幹・姿勢", color:"#f5a623" },
    { key:"armSwing",label:"腕振り",     color:"#c084fc" },
    { key:"footClearance",label:"足の上がり",color:"#39e0b0" },
  ];
  const cW=280, cH=100, pad=20;
  const validItems = items.filter(h => h.gait);
  if (validItems.length < 2) return null;
  return (
    <div style={{marginTop:16}}>
      <div style={{fontSize:11,color:"rgba(255,255,255,0.35)",letterSpacing:2,marginBottom:10}}>歩行指標の推移</div>
      <svg width="100%" viewBox={`0 0 ${cW} ${cH}`} style={{overflow:"visible"}}>
        <defs>
          {metrics.map((m,i) => (
            <linearGradient key={i} id={`smg${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={m.color} stopOpacity="0.15"/>
              <stop offset="100%" stopColor={m.color} stopOpacity="0"/>
            </linearGradient>
          ))}
        </defs>
        {[40,60,80].map(v => {
          const y = cH-pad-((v-20)/(100-20))*(cH-pad*2);
          return <line key={v} x1={pad} y1={y} x2={cW-pad} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1"/>;
        })}
        {metrics.map((m, mi) => {
          const pts = validItems.map((h,i) => ({
            x: pad+(i/(validItems.length-1))*(cW-pad*2),
            y: cH-pad-((getScore(h.gait[m.key])-20)/(100-20))*(cH-pad*2),
            score: getScore(h.gait[m.key])
          }));
          const pathD = pts.map((p,i)=>`${i===0?"M":"L"} ${p.x} ${p.y}`).join(" ");
          return (
            <g key={mi}>
              <path d={pathD} fill="none" stroke={m.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.8"/>
              {pts.map((p,i) => (
                <circle key={i} cx={p.x} cy={p.y} r={3} fill={m.color} stroke="rgba(10,15,30,1)" strokeWidth={1.5}/>
              ))}
            </g>
          );
        })}
        {validItems.map((h,i) => {
          const x = pad+(i/(validItems.length-1))*(cW-pad*2);
          const d = h.date ? new Date(h.date) : null;
          const label = d ? `${d.getMonth()+1}/${d.getDate()}` : "";
          return <text key={i} x={x} y={cH-4} textAnchor="middle" fontSize="7" fill="rgba(255,255,255,0.35)">{label}</text>;
        })}
      </svg>
      <div style={{display:"flex",flexWrap:"wrap",gap:"6px 12px",marginTop:8}}>
        {metrics.map((m,i) => (
          <div key={i} style={{display:"flex",alignItems:"center",gap:4}}>
            <div style={{width:16,height:3,borderRadius:2,background:m.color}}/>
            <span style={{fontSize:10,color:"rgba(255,255,255,0.5)"}}>{m.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ShareExerciseCard({ ex, idx }) {
  const C = LIGHT;
  const [open,setOpen]=useState(false);
  const cols=[C.accent,C.blue,C.amber,"#c084fc","#f472b6"];
  const col=cols[idx%cols.length];
  return (<div onClick={()=>setOpen(!open)} style={{background:C.panel,border:`1px solid ${open?col+"55":C.border}`,borderRadius:12,padding:"14px 16px",cursor:"pointer",transition:"border-color 0.2s",boxShadow:open?`0 0 24px ${col}18`:"none",marginBottom:8}}><div style={{display:"flex",alignItems:"center",gap:10}}><div style={{flex:1,minWidth:0}}><div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontWeight:700,color:C.text,fontSize:14}}>{ex.name}</span>{ex.isNew===false&&<span style={{fontSize:9,background:C.amber+"22",color:C.amber,border:`1px solid ${C.amber}44`,borderRadius:100,padding:"1px 7px",fontWeight:700}}>継続</span>}</div><div style={{fontSize:11,color:C.muted,marginTop:2}}>{ex.target} ／ {ex.duration}</div></div><div style={{color:C.muted,fontSize:16,transform:open?"rotate(180deg)":"none",transition:"0.2s",flexShrink:0}}>▾</div></div><div style={{display:"flex",justifyContent:"flex-end",marginTop:4,opacity:0.85}}>{getExerciseSVG(ex.name,ex.target,col)}</div>{open&&(<div style={{marginTop:14,borderTop:`${C.borderW} solid ${C.border}`,paddingTop:14}}>{ex.steps.map((s,i)=>(<div key={i} style={{display:"flex",gap:10,marginBottom:12,alignItems:"center",background:col+"08",borderRadius:10,padding:"8px 10px"}}><div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,flexShrink:0}}><span style={{minWidth:22,height:22,borderRadius:"50%",background:col+"22",color:col,fontSize:11,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800}}>{i+1}</span>{getStepPoseSVG(s,col)}</div><span style={{fontSize:13,color:C.text,lineHeight:1.6}}>{s}</span></div>))}<div style={{marginTop:10,padding:"8px 12px",background:col+"0f",borderRadius:8,borderLeft:`3px solid ${col}`,fontSize:12,color:col}}>💡 {ex.effect}</div></div>)}</div>);
}

function getStepPoseSVG(step, col) {
  const s = step || "";
  const size = 48;
  if (s.includes("座")||s.includes("腰かけ")||s.includes("イス")||s.includes("椅子")) {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect x="8" y="30" width="32" height="3.5" rx="1.75" fill={col} opacity="0.35"/>
        <rect x="10" y="33" width="3.5" height="10" rx="1.75" fill={col} opacity="0.25"/>
        <rect x="34" y="33" width="3.5" height="10" rx="1.75" fill={col} opacity="0.25"/>
        <rect x="33" y="18" width="3.5" height="14" rx="1.75" fill={col} opacity="0.25"/>
        <circle cx="24" cy="8" r="5.5" fill={col}/>
        <rect x="19" y="13" width="10" height="12" rx="5" fill={col} opacity="0.85"/>
        <rect x="13" y="24" width="9" height="4.5" rx="2.25" fill={col} opacity="0.75"/>
        <rect x="26" y="24" width="9" height="4.5" rx="2.25" fill={col} opacity="0.75"/>
        <rect x="13" y="28" width="3.5" height="8" rx="1.75" fill={col} opacity="0.65"/>
        <rect x="31" y="28" width="3.5" height="8" rx="1.75" fill={col} opacity="0.65"/>
      </svg>
    );
  }
  if (s.includes("足を上げ")||s.includes("膝を上げ")||s.includes("脚を上げ")||s.includes("高く上げ")) {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="7" r="5.5" fill={col}/>
        <line x1="24" y1="12" x2="24" y2="28" stroke={col} strokeWidth="3.5" strokeLinecap="round"/>
        <line x1="24" y1="18" x2="14" y2="24" stroke={col} strokeWidth="3" strokeLinecap="round" opacity="0.75"/>
        <line x1="24" y1="18" x2="34" y2="24" stroke={col} strokeWidth="3" strokeLinecap="round" opacity="0.75"/>
        <line x1="24" y1="28" x2="16" y2="42" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.85"/>
        <line x1="24" y1="28" x2="32" y2="22" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.75"/>
        <line x1="32" y1="22" x2="40" y2="26" stroke={col} strokeWidth="3" strokeLinecap="round" opacity="0.65"/>
        <line x1="8" y1="44" x2="40" y2="44" stroke={col} strokeWidth="1.5" strokeLinecap="round" opacity="0.25"/>
      </svg>
    );
  }
  if (s.includes("立ち上が")||s.includes("立って")||s.includes("立つ")||s.includes("立ちます")) {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="7" r="5.5" fill={col}/>
        <line x1="24" y1="12" x2="24" y2="30" stroke={col} strokeWidth="3.5" strokeLinecap="round"/>
        <line x1="24" y1="18" x2="14" y2="25" stroke={col} strokeWidth="3" strokeLinecap="round" opacity="0.75"/>
        <line x1="24" y1="18" x2="34" y2="25" stroke={col} strokeWidth="3" strokeLinecap="round" opacity="0.75"/>
        <line x1="24" y1="30" x2="18" y2="44" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.85"/>
        <line x1="24" y1="30" x2="30" y2="44" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.7"/>
        <line x1="8" y1="44" x2="40" y2="44" stroke={col} strokeWidth="1.5" strokeLinecap="round" opacity="0.25"/>
      </svg>
    );
  }
  if (s.includes("かかと")||s.includes("つま先")||s.includes("踵")||s.includes("爪先")) {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="7" r="5.5" fill={col}/>
        <line x1="24" y1="12" x2="24" y2="30" stroke={col} strokeWidth="3.5" strokeLinecap="round"/>
        <line x1="24" y1="18" x2="14" y2="24" stroke={col} strokeWidth="3" strokeLinecap="round" opacity="0.75"/>
        <line x1="24" y1="18" x2="34" y2="24" stroke={col} strokeWidth="3" strokeLinecap="round" opacity="0.75"/>
        <line x1="24" y1="30" x2="18" y2="40" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.85"/>
        <line x1="24" y1="30" x2="30" y2="40" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.7"/>
        <line x1="18" y1="40" x2="18" y2="36" stroke={col} strokeWidth="3" strokeLinecap="round" opacity="0.8"/>
        <line x1="30" y1="40" x2="30" y2="36" stroke={col} strokeWidth="3" strokeLinecap="round" opacity="0.65"/>
        <line x1="8" y1="44" x2="40" y2="44" stroke={col} strokeWidth="1.5" strokeLinecap="round" opacity="0.25"/>
      </svg>
    );
  }
  if (s.includes("腕")||s.includes("手を")||s.includes("前に伸")) {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="7" r="5.5" fill={col}/>
        <line x1="24" y1="12" x2="24" y2="30" stroke={col} strokeWidth="3.5" strokeLinecap="round"/>
        <line x1="24" y1="18" x2="8" y2="22" stroke={col} strokeWidth="3" strokeLinecap="round" opacity="0.85"/>
        <line x1="24" y1="18" x2="40" y2="22" stroke={col} strokeWidth="3" strokeLinecap="round" opacity="0.85"/>
        <line x1="24" y1="30" x2="18" y2="44" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.85"/>
        <line x1="24" y1="30" x2="30" y2="44" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.7"/>
        <line x1="8" y1="44" x2="40" y2="44" stroke={col} strokeWidth="1.5" strokeLinecap="round" opacity="0.25"/>
      </svg>
    );
  }
  if (s.includes("深呼吸")||s.includes("息を")||s.includes("呼吸")||s.includes("リラックス")) {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="7" r="5.5" fill={col}/>
        <line x1="24" y1="12" x2="24" y2="30" stroke={col} strokeWidth="3.5" strokeLinecap="round"/>
        <line x1="24" y1="17" x2="14" y2="22" stroke={col} strokeWidth="3" strokeLinecap="round" opacity="0.75"/>
        <line x1="24" y1="17" x2="34" y2="22" stroke={col} strokeWidth="3" strokeLinecap="round" opacity="0.75"/>
        <line x1="24" y1="30" x2="18" y2="44" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.85"/>
        <line x1="24" y1="30" x2="30" y2="44" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.7"/>
        <path d="M 14 10 Q 10 14 14 18" stroke={col} strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.5"/>
        <path d="M 34 10 Q 38 14 34 18" stroke={col} strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.5"/>
        <line x1="8" y1="44" x2="40" y2="44" stroke={col} strokeWidth="1.5" strokeLinecap="round" opacity="0.25"/>
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="7" r="5.5" fill={col}/>
      <line x1="24" y1="12" x2="24" y2="30" stroke={col} strokeWidth="3.5" strokeLinecap="round"/>
      <line x1="24" y1="18" x2="14" y2="25" stroke={col} strokeWidth="3" strokeLinecap="round" opacity="0.75"/>
      <line x1="24" y1="18" x2="34" y2="25" stroke={col} strokeWidth="3" strokeLinecap="round" opacity="0.75"/>
      <line x1="24" y1="30" x2="18" y2="44" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.85"/>
      <line x1="24" y1="30" x2="30" y2="44" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.7"/>
      <line x1="8" y1="44" x2="40" y2="44" stroke={col} strokeWidth="1.5" strokeLinecap="round" opacity="0.25"/>
    </svg>
  );
}

function getExerciseSVG(name, target, col) {
  const t = (name||"") + (target||"");
  // 椅子・座位系
  if (t.includes("イス")||t.includes("椅子")||t.includes("座って")||t.includes("座位")) {
    return (
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
        {/* 椅子 */}
        <rect x="10" y="36" width="36" height="4" rx="2" fill={col} opacity="0.4"/>
        <rect x="12" y="40" width="4" height="10" rx="2" fill={col} opacity="0.3"/>
        <rect x="40" y="40" width="4" height="10" rx="2" fill={col} opacity="0.3"/>
        <rect x="38" y="20" width="4" height="20" rx="2" fill={col} opacity="0.3"/>
        {/* 人物 */}
        <circle cx="28" cy="10" r="6" fill={col}/>
        {/* 胴体 */}
        <rect x="22" y="16" width="12" height="14" rx="6" fill={col} opacity="0.85"/>
        {/* 太もも */}
        <rect x="16" y="28" width="10" height="5" rx="2.5" fill={col} opacity="0.8"/>
        <rect x="30" y="28" width="10" height="5" rx="2.5" fill={col} opacity="0.8"/>
        {/* 片足上げ */}
        <rect x="16" y="33" width="4" height="10" rx="2" fill={col} opacity="0.7"/>
        <line x1="36" y1="33" x2="44" y2="30" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.8"/>
      </svg>
    );
  }
  // 歩行・歩き系
  if (t.includes("歩")||t.includes("ウォーク")||t.includes("シルバーカー")||t.includes("歩行")) {
    return (
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
        {/* 人物 */}
        <circle cx="28" cy="9" r="6" fill={col}/>
        {/* 胴体 */}
        <line x1="28" y1="15" x2="28" y2="32" stroke={col} strokeWidth="4" strokeLinecap="round"/>
        {/* 腕 */}
        <line x1="28" y1="20" x2="18" y2="28" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.8"/>
        <line x1="28" y1="20" x2="38" y2="26" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.8"/>
        {/* 足 */}
        <line x1="28" y1="32" x2="18" y2="46" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.9"/>
        <line x1="28" y1="32" x2="36" y2="44" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.7"/>
        {/* 地面 */}
        <line x1="10" y1="50" x2="46" y2="50" stroke={col} strokeWidth="2" strokeLinecap="round" opacity="0.3"/>
      </svg>
    );
  }
  // バランス・片足立ち系
  if (t.includes("バランス")||t.includes("片足")||t.includes("重心")||t.includes("かかと上げ")||t.includes("つま先")) {
    return (
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
        {/* 人物 */}
        <circle cx="28" cy="9" r="6" fill={col}/>
        {/* 胴体 */}
        <line x1="28" y1="15" x2="28" y2="33" stroke={col} strokeWidth="4" strokeLinecap="round"/>
        {/* 腕バランス */}
        <line x1="28" y1="21" x2="14" y2="26" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.8"/>
        <line x1="28" y1="21" x2="42" y2="26" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.8"/>
        {/* 片足立ち */}
        <line x1="28" y1="33" x2="28" y2="50" stroke={col} strokeWidth="4" strokeLinecap="round"/>
        {/* 上げた足 */}
        <line x1="28" y1="38" x2="38" y2="44" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.7"/>
        {/* 地面 */}
        <line x1="14" y1="50" x2="42" y2="50" stroke={col} strokeWidth="2" strokeLinecap="round" opacity="0.3"/>
      </svg>
    );
  }
  // 壁・立位・背すじ系
  if (t.includes("壁")||t.includes("背すじ")||t.includes("立ち")||t.includes("伸ばし")||t.includes("姿勢")) {
    return (
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
        {/* 壁 */}
        <rect x="38" y="6" width="5" height="46" rx="2.5" fill={col} opacity="0.2"/>
        {/* 人物 */}
        <circle cx="26" cy="10" r="6" fill={col}/>
        {/* 胴体まっすぐ */}
        <line x1="26" y1="16" x2="26" y2="36" stroke={col} strokeWidth="4" strokeLinecap="round"/>
        {/* 腕 壁に添える */}
        <line x1="26" y1="22" x2="37" y2="24" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.8"/>
        <line x1="26" y1="22" x2="16" y2="28" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.6"/>
        {/* 足 */}
        <line x1="26" y1="36" x2="20" y2="50" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.9"/>
        <line x1="26" y1="36" x2="32" y2="50" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.7"/>
        {/* 地面 */}
        <line x1="10" y1="50" x2="42" y2="50" stroke={col} strokeWidth="2" strokeLinecap="round" opacity="0.3"/>
      </svg>
    );
  }
  // デフォルト（体操一般）
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
      <circle cx="28" cy="9" r="6" fill={col}/>
      <line x1="28" y1="15" x2="28" y2="33" stroke={col} strokeWidth="4" strokeLinecap="round"/>
      <line x1="28" y1="20" x2="16" y2="30" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.8"/>
      <line x1="28" y1="20" x2="40" y2="30" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.8"/>
      <line x1="28" y1="33" x2="20" y2="50" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.9"/>
      <line x1="28" y1="33" x2="36" y2="50" stroke={col} strokeWidth="3.5" strokeLinecap="round" opacity="0.7"/>
      <line x1="10" y1="50" x2="46" y2="50" stroke={col} strokeWidth="2" strokeLinecap="round" opacity="0.3"/>
    </svg>
  );
}

function SharePage({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const theme = "light";
  const C = LIGHT;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/share?token=${encodeURIComponent(token)}`);
        const json = await res.json();
        if (!res.ok) { setError(json.error || "読み込みに失敗しました"); }
        else {
          const parsed = (json.history || []).map(h => {
            let r = {};
            try { r = JSON.parse(h.result_text); } catch(e) {}
            return { ...r, date: h.analyzed_at };
          });
          setData({ patientName: json.patient.name, history: parsed });
        }
      } catch (e) {
        setError("読み込みに失敗しました");
      }
      setLoading(false);
    })();
  }, [token]);

  if (loading) {
    return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:C.font,color:C.text}}>読み込み中...</div>;
  }
  if (error) {
    return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:C.font,color:C.red,padding:20,textAlign:"center"}}>{error}</div>;
  }

  const hist = data.history;
  return (
    <div style={{minHeight:"100vh",background:C.bgSolid,fontFamily:C.font,padding:"24px 16px"}}>
      <div style={{maxWidth:640,margin:"0 auto"}}>
        <h2 style={{fontSize:20,fontWeight:900,color:C.text,marginBottom:4}}>{data.patientName} さんの歩行測定記録</h2>
        <p style={{color:C.muted,fontSize:13,marginBottom:20}}>{hist.length}回の測定履歴</p>

        {hist.length>1 && (
          <div style={{background:C.panel,border:`2.5px solid ${C.border}`,borderRadius:14,padding:"16px 18px",marginBottom:16}}>
            <ShareGaitChart history={hist}/>
          </div>
        )}

        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {hist.map((h,i)=>{
            const col=h.score>=75?C.accent:h.score>=50?C.amber:C.red;
            return (
              <div key={i} style={{background:C.panel,border:`2.5px solid ${C.border}`,borderRadius:12,padding:"14px 16px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <span style={{fontSize:13,color:C.muted}}>{formatDate(h.date)}</span>
                  <span style={{fontWeight:900,fontSize:20,color:col,fontFamily:"'Space Mono',monospace"}}>{h.score}</span>
                </div>
                <div style={{fontSize:13,color:C.text,marginBottom:10}}>{h.summary}</div>
                {h.exercises && h.exercises.length>0 && (
                  <div style={{marginTop:8}}>
                    <div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:8}}>体操メニュー</div>
                    {h.exercises.map((ex,j)=><ShareExerciseCard key={j} ex={ex} idx={j}/>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{textAlign:"center",color:C.muted,fontSize:11,marginTop:24}}>このページはご家族向けの共有リンクです</div>
      </div>
    </div>
  );
}
