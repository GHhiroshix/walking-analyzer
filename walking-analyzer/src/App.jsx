import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "./supabase.js";

const C = {
  bg: "linear-gradient(135deg, #0a0f1e 0%, #0d1a2e 40%, #0a1628 70%, #060d18 100%)",
  bgSolid: "#0a0f1e",
  surface: "rgba(255,255,255,0.06)",
  panel: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.12)",
  accent: "#39e0b0", accentDim: "#1faa80", blue: "#4da6ff",
  amber: "#f5a623", red: "#ff4d6d", text: "#ddeeff",
  muted: "rgba(255,255,255,0.35)", mutedLight: "rgba(255,255,255,0.5)",
  font: "'Kosugi Maru', sans-serif",
};

const GlassOrbs = () => (
  <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,overflow:"hidden"}}>
    <div style={{position:"absolute",width:300,height:300,borderRadius:"50%",background:"radial-gradient(circle, rgba(57,224,176,0.2) 0%, transparent 70%)",top:-80,left:-80,filter:"blur(40px)"}}/>
    <div style={{position:"absolute",width:250,height:250,borderRadius:"50%",background:"radial-gradient(circle, rgba(77,166,255,0.15) 0%, transparent 70%)",bottom:100,right:-60,filter:"blur(35px)"}}/>
    <div style={{position:"absolute",width:200,height:200,borderRadius:"50%",background:"radial-gradient(circle, rgba(192,132,252,0.12) 0%, transparent 70%)",top:"40%",left:10,filter:"blur(30px)"}}/>
  </div>
);

async function getPatients(facilityId) {
  const { data, error } = await supabase.from("patients").select("id, name, furigana, created_at").eq("facility_id", facilityId).order("furigana", { ascending: true });
  if (error) { console.error(error); return []; }
  return data || [];
}
async function createPatient(facilityId, name, furigana) {
  const { data, error } = await supabase.from("patients").insert({ facility_id: facilityId, name, furigana }).select().single();
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

function toBase64(canvas) { return canvas.toDataURL("image/jpeg", 0.75).split(",")[1]; }
function formatTime(s) { return `${Math.floor(s/60).toString().padStart(2,"0")}:${Math.floor(s%60).toString().padStart(2,"0")}`; }
function formatDate(iso) { const d = new Date(iso); return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}`; }
// ベビーカー→歩行器 強制置換
function fixTerms(text) {
  if (!text) return text;
  return text.replace(/ベビーカー/g, "シルバーカー");
}
function scoreDiff(cur, prev) { const d = cur - prev; if (d > 0) return { label: `+${d}`, color: C.accent }; if (d < 0) return { label: `${d}`, color: C.red }; return { label: "±0", color: C.muted }; }

// 印刷用スコアカラー
function printScoreColor(score) {
  return score >= 75 ? "#1a6640" : score >= 50 ? "#b55a00" : "#c0151f";
}

const buildPrompt = (frameCount, history) => {
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

【スコアの決まり — 必ず守ること】
- scoreは0〜100の整数で返してください。
- 補助具（杖・歩行器・シルバーカーなど）を使用しながらでも安全に歩けている場合は、最低60点以上にしてください。
- 一定のリズムで継続して歩けている場合は、最低70点以上にしてください。
- 補助具なしで安定して歩けている場合は、最低75点以上にしてください。
- 転倒リスクが非常に高い・歩行が著しく不安定な場合のみ60点未満にしてください。

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
{"score":数値,"summary":"総合評価（25文字以内）","progress":"前回比コメント（初回はnull）","aids":{"detected":[],"usage":null,"recommendation":null},"gait":{"cadence":"","stride":"","posture":"","armSwing":"","footClearance":""},"issues":[{"title":"","detail":"","severity":"high|medium|low"}],"exercises":[{"name":"","target":"","duration":"","steps":[],"effect":"","isNew":true}],"lifestyle":[]}`;
};

function ScoreArc({ score }) {
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
    if (v==="良好"||v==="正常"||v==="自然") return 85;
    if (v.includes("十分")||v.includes("安定")||v.includes("良く")||v.includes("改善")||v.includes("伸び")) return 80;
    if (v.includes("やや")||v.includes("少し")) return 60;
    if (v.includes("不規則")||v.includes("小さい")||v.includes("少ない")||v.includes("擦る")||v.includes("前かがみ")) return 40;
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
  if (validItems.length < 1) return null;

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
        <text x={pad} y={cH-4} textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.35)">最古</text>
        <text x={cW-pad} y={cH-4} textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.35)">今回</text>
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
  return (<div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:14,padding:"16px 18px",marginBottom:10}}><div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:12}}>前回との比較 — {formatDate(prev.date)}</div><div style={{display:"flex",alignItems:"center",gap:16,marginBottom:14}}><div style={{textAlign:"center"}}><div style={{fontSize:11,color:C.muted,marginBottom:4}}>前回</div><div style={{fontSize:28,fontWeight:900,color:C.mutedLight,fontFamily:"'Space Mono',monospace"}}>{prev.score}</div></div><div style={{flex:1,textAlign:"center"}}><div style={{fontSize:22,fontWeight:900,color:diff.color,fontFamily:"'Space Mono',monospace"}}>{diff.label}</div><div style={{fontSize:10,color:C.muted}}>変化</div></div><div style={{textAlign:"center"}}><div style={{fontSize:11,color:C.muted,marginBottom:4}}>今回</div><div style={{fontSize:28,fontWeight:900,color:diff.color,fontFamily:"'Space Mono',monospace"}}>{current.score}</div></div></div>{current.progress&&<div style={{background:C.surface,borderRadius:8,padding:"10px 12px",borderLeft:`3px solid ${C.blue}`,fontSize:12,color:C.text,lineHeight:1.7}}>💬 {current.progress}</div>}</div>);
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
    if (v==="良好"||v==="正常"||v==="自然") return 85;
    if (v.includes("十分")||v.includes("安定")||v.includes("良く")||v.includes("改善")||v.includes("伸び")) return 80;
    if (v.includes("やや")||v.includes("少し")) return 60;
    if (v.includes("不規則")||v.includes("小さい")||v.includes("少ない")||v.includes("擦る")||v.includes("前かがみ")) return 40;
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

function SeverityDot({ s }) {
  const col=s==="high"?C.red:s==="medium"?C.amber:C.accent;
  return <span style={{display:"inline-block",width:7,height:7,borderRadius:"50%",background:col,marginRight:6,flexShrink:0,marginTop:5}}/>;
}

function ExerciseCard({ ex, idx }) {
  const [open,setOpen]=useState(false);
  const cols=[C.accent,C.blue,C.amber,"#c084fc","#f472b6"];
  const col=cols[idx%cols.length];
  return (<div onClick={()=>setOpen(!open)} style={{background:C.panel,border:`1px solid ${open?col+"55":C.border}`,borderRadius:12,padding:"14px 16px",cursor:"pointer",transition:"border-color 0.2s",boxShadow:open?`0 0 24px ${col}18`:"none",marginBottom:8}}><div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:36,height:36,borderRadius:10,background:col+"1a",border:`1px solid ${col}33`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>🏃</div><div style={{flex:1,minWidth:0}}><div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontWeight:700,color:C.text,fontSize:14}}>{ex.name}</span>{ex.isNew===false&&<span style={{fontSize:9,background:C.amber+"22",color:C.amber,border:`1px solid ${C.amber}44`,borderRadius:100,padding:"1px 7px",fontWeight:700}}>継続</span>}</div><div style={{fontSize:11,color:C.muted,marginTop:2}}>{ex.target} ／ {ex.duration}</div></div><div style={{color:C.muted,fontSize:16,transform:open?"rotate(180deg)":"none",transition:"0.2s",flexShrink:0}}>▾</div></div>{open&&(<div style={{marginTop:14,borderTop:`1px solid ${C.border}`,paddingTop:14}}>{ex.steps.map((s,i)=>(<div key={i} style={{display:"flex",gap:10,marginBottom:8,alignItems:"flex-start"}}><span style={{minWidth:22,height:22,borderRadius:"50%",background:col+"22",color:col,fontSize:11,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,flexShrink:0}}>{i+1}</span><span style={{fontSize:13,color:C.text,lineHeight:1.6}}>{s}</span></div>))}<div style={{marginTop:10,padding:"8px 12px",background:col+"0f",borderRadius:8,borderLeft:`3px solid ${col}`,fontSize:12,color:col}}>💡 {ex.effect}</div></div>)}</div>);
}

function FrameStrip({ frames, current, onSelect }) {
  return (<div style={{display:"flex",gap:6,overflowX:"auto",padding:"4px 0 8px"}}>{frames.map((f,i)=>(<div key={i} onClick={()=>onSelect(i)} style={{flexShrink:0,cursor:"pointer",border:`2px solid ${current===i?C.accent:C.border}`,borderRadius:6,overflow:"hidden",boxShadow:current===i?`0 0 12px ${C.accent}44`:"none",transition:"all 0.15s"}}><img src={`data:image/jpeg;base64,${f.b64}`} alt={`f${i}`} style={{display:"block",width:72,height:48,objectFit:"cover"}}/><div style={{textAlign:"center",fontSize:9,color:C.muted,padding:"2px 0",background:C.surface}}>{formatTime(f.time)}</div></div>))}</div>);
}

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
          ${ex.steps.map((s,j)=>`<div class="ex-step">${j+1}. ${s}</div>`).join("")}
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

export default function WalkingVideoAnalyzer() {
  const [phase, setPhase] = useState("loading");
  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [session, setSession] = useState(null);
  const [checks, setChecks] = useState({c1:false,c2:false,c3:false,c4:false});
  const [patients, setPatients] = useState([]);
  const [patientId, setPatientId] = useState(null);
  const [patientName, setPatientName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [furiganaInput, setFuriganaInput] = useState("");
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
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const tapTargetXRef = useRef(null);

  useEffect(() => {
    const timeout = setTimeout(() => setPhase("login"), 3000);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) { setPhase("consent"); loadPatients(s.user.id); } else { setPhase("login"); }
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s) { setPhase("consent"); loadPatients(s.user.id); } else { setPhase("login"); }
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
    if (session) await loadPatients(session.user.id);
  };

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
        imageContent.push({type:"text",text:buildPrompt(extracted.length,patientHistory)});
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

        // ①前回スコアから±10点制限
        const prevScore = patientHistory.length > 0 ? patientHistory[0].score : null;
        if (prevScore !== null) {
          if (parsed.score > prevScore + 10) parsed.score = prevScore + 10;
          if (parsed.score < prevScore - 10) parsed.score = prevScore - 10;
        }
        const parsedFixed = { ...parsed, summary: fixTerms(parsed.summary), progress: fixTerms(parsed.progress), aids: parsed.aids ? { ...parsed.aids, detected: (parsed.aids.detected||[]).map(fixTerms), usage: fixTerms(parsed.aids.usage), recommendation: fixTerms(parsed.aids.recommendation) } : parsed.aids, gait: parsed.gait ? Object.fromEntries(Object.entries(parsed.gait).map(([k,v])=>[k,fixTerms(v)])) : parsed.gait, issues: (parsed.issues||[]).map(iss=>({...iss, title:fixTerms(iss.title), detail:fixTerms(iss.detail)})), exercises: (parsed.exercises||[]).map(ex=>({...ex, name:fixTerms(ex.name), target:fixTerms(ex.target), effect:fixTerms(ex.effect), steps:(ex.steps||[]).map(fixTerms)})), lifestyle: (parsed.lifestyle||[]).map(fixTerms) };
        const record = { date:new Date().toISOString(), score:parsedFixed.score, summary:parsedFixed.summary, issues:parsedFixed.issues, exercises:parsedFixed.exercises };
        await saveAnalysis(patientId, session.user.id, record, parsedFixed);
        const newHistory = await getPatientHistory(patientId);
        setPatientHistory(newHistory);
        setResult(parsedFixed);
        setActiveTab(newHistory.length>1?"compare":"gait");
        setPhase("result");
      } finally { vid.src=""; document.body.removeChild(vid); }
    } catch(e) { console.error(e); setError("エラー: "+e.message); setPhase("upload"); }
  };

  const restart = async () => {
    setPhase("userSelect");
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null); setFrames([]); setResult(null);
    setError(null); setProgress(0); setActiveTab("gait"); setCurrentFrame(0);
    if (session) await loadPatients(session.user.id);
  };

  const DeleteDialog = () => {
    if (!deleteConfirm) return null;
    return (
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:"0 16px"}}>
        <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:16,padding:"24px",width:"100%",maxWidth:340}}>
          <div style={{fontSize:18,marginBottom:12,textAlign:"center"}}>{deleteConfirm.type==="patient"?"🗑️":"📋"}</div>
          <div style={{fontWeight:700,fontSize:15,marginBottom:8,textAlign:"center",color:C.text}}>{deleteConfirm.type==="patient"?"利用者を削除しますか？":"履歴を削除しますか？"}</div>
          <div style={{fontSize:13,color:C.muted,textAlign:"center",marginBottom:20,lineHeight:1.6}}>
            <span style={{color:C.text,fontWeight:700}}>{deleteConfirm.name}</span>
            {deleteConfirm.type==="patient"?"さんのデータと全履歴が削除されます。":"さんの解析履歴がすべて削除されます。"}
            <br/>この操作は取り消せません。
          </div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>setDeleteConfirm(null)} style={{flex:1,padding:"11px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:10,color:C.muted,fontSize:13,cursor:"pointer",fontFamily:C.font}}>キャンセル</button>
            <button onClick={handleDeleteConfirm} style={{flex:1,padding:"11px",background:C.red,border:"none",borderRadius:10,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:C.font}}>削除する</button>
          </div>
        </div>
      </div>
    );
  };

  // ── LOGIN ─────────────────────────────────────────────────────────────────
  if (phase==="login") {
    const handleAuth = async () => {
      if (!authEmail.trim()||!authPassword.trim()) return;
      setAuthLoading(true); setAuthError(null);
      let error;
      if (authMode==="signup") {
        const res = await supabase.auth.signUp({ email:authEmail, password:authPassword });
        error = res.error;
        if (!error) { setAuthError("確認メールを送信しました。メールのリンクをクリックしてからログインしてください。"); setAuthMode("login"); setAuthLoading(false); return; }
      } else {
        const res = await supabase.auth.signInWithPassword({ email:authEmail, password:authPassword });
        error = res.error;
      }
      if (error) setAuthError(error.message);
      setAuthLoading(false);
    };
    return (
      <div style={wrap}><GlassOrbs/><div style={maxW}>
        <div style={{paddingTop:60,marginBottom:32,textAlign:"center"}}>
          <div style={{display:"inline-flex",gap:6,alignItems:"center",background:"rgba(57,224,176,0.12)",border:`1px solid rgba(57,224,176,0.25)`,borderRadius:100,padding:"5px 14px",marginBottom:20,fontSize:10,color:C.accent,letterSpacing:3,fontWeight:700}}>🎬 VIDEO GAIT ANALYSIS</div>
          <h1 style={{fontSize:26,fontWeight:900,lineHeight:1.3,margin:0,color:C.text}}>{authMode==="login"?"施設ログイン":"施設アカウント登録"}</h1>
          <p style={{color:C.muted,marginTop:10,fontSize:13}}>{authMode==="login"?"メールアドレスとパスワードでログイン":"施設のメールとパスワードを設定"}</p>
        </div>
        {authError&&<div style={{background:authError.includes("確認メール")?"rgba(57,224,176,0.12)":"rgba(255,77,109,0.12)",border:`1px solid ${authError.includes("確認メール")?"rgba(57,224,176,0.3)":"rgba(255,77,109,0.3)"}`,borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:13,color:authError.includes("確認メール")?C.accent:C.red}}>{authError}</div>}
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
          <input value={authEmail} onChange={e=>setAuthEmail(e.target.value)} placeholder="メールアドレス" type="email" style={{background:"rgba(255,255,255,0.07)",border:`1px solid ${C.border}`,borderRadius:12,padding:"13px 14px",color:C.text,fontSize:14,fontFamily:C.font,outline:"none"}}/>
          <input value={authPassword} onChange={e=>setAuthPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAuth()} placeholder="パスワード（8文字以上）" type="password" style={{background:"rgba(255,255,255,0.07)",border:`1px solid ${C.border}`,borderRadius:12,padding:"13px 14px",color:C.text,fontSize:14,fontFamily:C.font,outline:"none"}}/>
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
      <div style={wrap}><GlassOrbs/><div style={maxW}>
        <div style={{paddingTop:16,display:"flex",justifyContent:"flex-end"}}>
          <button onClick={handleLogout} style={{background:"none",border:`1px solid ${C.border}`,color:C.muted,cursor:"pointer",fontSize:12,padding:"5px 12px",borderRadius:8,fontFamily:C.font}}>ログアウト</button>
        </div>
        <div style={{paddingTop:24,marginBottom:28,textAlign:"center"}}>
          <div style={{display:"inline-flex",gap:6,alignItems:"center",background:C.accent+"14",border:`1px solid ${C.accent}2a`,borderRadius:100,padding:"5px 14px",marginBottom:20,fontSize:10,color:C.accent,letterSpacing:3,fontWeight:700}}>🎬 VIDEO GAIT ANALYSIS</div>
          <h1 style={{fontSize:26,fontWeight:900,lineHeight:1.3,margin:0,color:C.text}}>ご利用前の<br/><span style={{color:C.accent}}>同意確認</span></h1>
          <p style={{color:C.muted,marginTop:12,fontSize:13,lineHeight:1.8}}>本アプリは歩行動画をAIで解析します。<br/>下記をご確認のうえ、すべてにチェックをお願いします。</p>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>
          {ITEMS.map(({key,label,note,imp})=>{ const checked=checks[key]; return (
            <div key={key} onClick={()=>setChecks(p=>({...p,[key]:!p[key]}))} style={{display:"flex",gap:12,alignItems:"flex-start",background:checked?C.accent+"0a":C.surface,border:`1.5px solid ${checked?C.accent+"55":C.border}`,borderRadius:12,padding:"14px 16px",cursor:"pointer",transition:"all 0.15s"}}>
              <div style={{width:22,height:22,borderRadius:6,flexShrink:0,marginTop:1,border:`2px solid ${checked?C.accent:imp?C.amber+"88":C.muted}`,background:checked?C.accent:"transparent",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s"}}>
                {checked&&<svg width="12" height="10" viewBox="0 0 12 10" fill="none"><path d="M1 5L4.5 8.5L11 1" stroke={C.bgSolid} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </div>
              <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,lineHeight:1.5,color:C.text}}>{imp&&<span style={{color:C.amber,fontSize:10,marginRight:4}}>★</span>}{label}</div><div style={{fontSize:11,color:C.muted,marginTop:4,lineHeight:1.6}}>{note}</div></div>
            </div>
          );})}
        </div>
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 16px",marginBottom:20,fontSize:12,color:C.muted,lineHeight:1.7}}>
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
      <div style={wrap}><GlassOrbs/><div style={maxW}>
        <div style={{paddingTop:40,marginBottom:24}}>
          <button onClick={()=>setHistoryDetail(null)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:13,padding:0,marginBottom:20,fontFamily:C.font}}>← 履歴一覧に戻る</button>
          <div style={{fontSize:11,color:C.muted,marginBottom:4}}>{formatDate(h.date)}</div>
          <h2 style={{fontSize:20,fontWeight:900,margin:0,color:C.text}}>{h.summary}</h2>
        </div>
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:20,padding:"24px 20px",marginBottom:12,display:"flex",flexDirection:"column",alignItems:"center"}}>
          <ScoreArc score={h.score}/>
          <div style={{fontWeight:900,fontSize:15,marginTop:4,textAlign:"center",color:C.text}}>{h.summary}</div>
        </div>
        {h.gait&&(<div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:14,padding:"20px 18px",marginBottom:12}}><div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:16}}>GAIT METRICS</div><GaitRadarChart gait={h.gait}/></div>)}
        {h.issues&&h.issues.length>0&&(<div style={{marginBottom:12}}><div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:10}}>課題</div><div style={{display:"flex",flexDirection:"column",gap:8}}>{h.issues.map((issue,i)=>(<div key={i} style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px"}}><div style={{display:"flex",alignItems:"flex-start",gap:4,marginBottom:6}}><SeverityDot s={issue.severity}/><span style={{fontWeight:700,fontSize:14,color:C.text}}>{issue.title}</span></div><p style={{margin:0,fontSize:13,color:C.mutedLight,lineHeight:1.65,paddingLeft:13}}>{issue.detail}</p></div>))}</div></div>)}
        {h.exercises&&h.exercises.length>0&&(<div style={{marginBottom:12}}><div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:10}}>体操メニュー</div>{h.exercises.map((ex,i)=><ExerciseCard key={i} ex={ex} idx={i}/>)}</div>)}
        <div style={{display:"flex",gap:10,marginTop:4}}>
          <button onClick={()=>setHistoryDetail(null)} style={{flex:1,padding:"13px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,color:C.mutedLight,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:C.font}}>← 履歴一覧</button>
          <button onClick={handleHistoryPrint} style={{flex:1,padding:"13px",background:`linear-gradient(135deg,${C.accent},${C.accentDim})`,border:"none",borderRadius:12,color:C.bgSolid,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:C.font}}>🖨️ 印刷</button>
          <button onClick={()=>{setPatientId(historyPatient.id);setPatientName(historyPatient.name);setPatientHistory(historyPatient.history||[]);setPhase("upload");}} style={{flex:1,padding:"13px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,color:C.text,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:C.font}}>新しく測定 →</button>
        </div>
      </div></div>
    );
  }

  // ── HISTORY LIST ──────────────────────────────────────────────────────────
  if (phase==="historyList" && historyPatient) {
    const hist = historyPatient.history || [];
    return (
      <div style={wrap}><GlassOrbs/><div style={maxW}>
        <div style={{paddingTop:40,marginBottom:24}}>
          <button onClick={()=>{setPhase("userSelect");setHistoryPatient(null);}} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:13,padding:0,marginBottom:20,fontFamily:C.font}}>← 利用者選択に戻る</button>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div>
              <h2 style={{fontSize:22,fontWeight:900,margin:0,color:C.text}}>{historyPatient.name}</h2>
              <p style={{color:C.muted,fontSize:13,marginTop:4}}>{hist.length}回の測定履歴</p>
            </div>
            <button onClick={()=>{setPatientId(historyPatient.id);setPatientName(historyPatient.name);setPatientHistory(hist);setPhase("upload");}} style={{padding:"10px 16px",background:`linear-gradient(135deg,${C.accent},${C.accentDim})`,border:"none",borderRadius:10,color:C.bgSolid,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:C.font}}>新しく測定 →</button>
          </div>
        </div>
        {hist.length===0?(
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"32px",textAlign:"center",color:C.muted,fontSize:13}}>まだ測定履歴がありません</div>
        ):(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {hist.map((h,i)=>{
              const col=h.score>=75?C.accent:h.score>=50?C.amber:C.red;
              return (
                <div key={i} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px",transition:"all 0.15s"}}>
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
                  <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`}}>
                    <button
                      onClick={async()=>{
                        if(!window.confirm(`${formatDate(h.date)}の解析結果を削除しますか？`)) return;
                        await deleteSingleHistory(h.id);
                        const newHist = await getPatientHistory(historyPatient.id);
                        const updated = {...historyPatient, history: newHist};
                        setHistoryPatient(updated);
                        if(session) await loadPatients(session.user.id);
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

  // ── USER SELECT ───────────────────────────────────────────────────────────
  if (phase==="userSelect") {
    const addNew = async () => {
      if (!nameInput.trim()) return;
      // 重複チェック（名前＋ふりがなが両方一致する場合）
      const dup = patients.find(p =>
        p.name === nameInput.trim() && p.furigana === furiganaInput.trim()
      );
      if (dup) { setError(`「${nameInput.trim()}」さんはすでに登録されています。`); return; }
      const newPatient = await createPatient(session.user.id, nameInput.trim(), furiganaInput.trim());
      if (!newPatient) { setError("登録に失敗しました。再度お試しください。"); return; }
      setPatientId(newPatient.id); setPatientName(newPatient.name); setPatientHistory([]); setNameInput(""); setFuriganaInput(""); setSearchQuery("");
      await loadPatients(session.user.id); setPhase("upload");
    };

    // 検索フィルター（名前・ふりがな両方）
    const filtered = patients.filter(p => {
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      return (p.name||"").toLowerCase().includes(q) || (p.furigana||"").toLowerCase().includes(q);
    });

    return (
      <div style={wrap}><GlassOrbs/><div style={maxW}>
        <DeleteDialog/>
        <div style={{paddingTop:40,marginBottom:28}}>
          <button onClick={()=>setPhase("consent")} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:13,padding:0,marginBottom:20,fontFamily:C.font}}>← 同意画面に戻る</button>
          <h2 style={{fontSize:22,fontWeight:900,margin:0,color:C.text}}>利用者を選択</h2>
          <p style={{color:C.muted,fontSize:13,marginTop:8}}>初回の方は新規登録、2回目以降の方は名前を選んでください</p>
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
                style={{width:"100%",boxSizing:"border-box",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"11px 12px 11px 36px",color:C.text,fontSize:13,fontFamily:C.font,outline:"none"}}
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
              <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"20px",textAlign:"center",color:C.muted,fontSize:13}}>
                「{searchQuery}」に一致する利用者が見つかりません
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {filtered.map(p=>{
                  const hist=p.history||[], last=hist[0];
                  return (
                    <div key={p.id} style={{background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:12,padding:"14px 16px",transition:"all 0.15s"}}>
                      <div style={{display:"flex",alignItems:"center",gap:12}} onClick={()=>{setHistoryPatient(p);setPhase("historyList");}}>
                        <div style={{width:40,height:40,borderRadius:"50%",background:C.panel,border:`2px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0,cursor:"pointer"}}>👤</div>
                        <div style={{flex:1,minWidth:0,cursor:"pointer"}}>
                          <div style={{fontWeight:700,fontSize:15,color:C.text}}>{p.name}</div>
                          {p.furigana&&<div style={{fontSize:11,color:C.accent,marginTop:1}}>{p.furigana}</div>}
                          <div style={{fontSize:11,color:C.muted,marginTop:2}}>{hist.length>0?`${hist.length}回測定済み ／ 最終: ${formatDate(last.date)} ／ スコア: ${last.score}`:"測定歴なし"}</div>
                        </div>
                        <div style={{color:C.muted,fontSize:16,cursor:"pointer"}}>›</div>
                      </div>
                      <div style={{display:"flex",gap:8,marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`}}>
                        <button onClick={e=>{e.stopPropagation();setDeleteConfirm({id:p.id,name:p.name,type:"history"});}} style={{flex:1,padding:"7px",background:"transparent",border:`1px solid ${C.amber}44`,borderRadius:8,color:C.amber,fontSize:11,cursor:"pointer",fontFamily:C.font}}>📋 履歴を削除</button>
                        <button onClick={e=>{e.stopPropagation();setDeleteConfirm({id:p.id,name:p.name,type:"patient"});}} style={{flex:1,padding:"7px",background:"transparent",border:`1px solid ${C.red}44`,borderRadius:8,color:C.red,fontSize:11,cursor:"pointer",fontFamily:C.font}}>🗑️ 利用者を削除</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 新規登録 */}
        <div style={{background:C.amber+"12",border:`1.5px solid ${C.amber}44`,borderRadius:12,padding:"16px",marginBottom:16}}>
          <div style={{fontSize:11,color:C.amber,letterSpacing:2,marginBottom:12,fontWeight:700}}>⚡ クイック解析（匿名・履歴なし）</div>
          <div style={{fontSize:12,color:C.mutedLight,marginBottom:12,lineHeight:1.7}}>利用者登録不要で1回だけ解析できます。結果はDBに保存されません。</div>
          <button onClick={()=>{setIsQuick(true);setPatientId(null);setPatientName("匿名");setPatientHistory([]);setPhase("upload");}} style={{width:"100%",padding:"11px",background:`linear-gradient(135deg,${C.amber},#e8821a)`,border:"none",borderRadius:8,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:C.font}}>⚡ クイック解析を開始</button>
        </div>
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"16px"}}>
          <div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:12}}>新規登録</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <input
              value={furiganaInput}
              onChange={e=>setFuriganaInput(e.target.value)}
              placeholder="ふりがな（例：たなかよしこ）"
              style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",color:C.text,fontSize:13,fontFamily:C.font,outline:"none"}}
            />
            <div style={{display:"flex",gap:8}}>
              <input
                value={nameInput}
                onChange={e=>setNameInput(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter"&&!e.isComposing&&e.keyCode!==229)addNew()}}
                placeholder="お名前（例：田中様）"
                style={{flex:1,background:C.panel,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",color:C.text,fontSize:13,fontFamily:C.font,outline:"none"}}
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
      <div style={wrap}><GlassOrbs/><div style={maxW}>
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
            <video ref={videoRef} src={videoUrl} controls playsInline style={{width:"100%",borderRadius:12,background:"#000",maxHeight:320,border:`1px solid ${C.border}`}}/>
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
            <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px",marginTop:12}}>
              <div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:10,fontWeight:700}}>解析前チェック</div>
              {[["スマホを固定して撮影した（横に動かして追いかけていない）",true],["真横から全身が映っている",true],["明るさは十分で影が少ない",false]].map(([label,imp])=>(
                <div key={label} style={{display:"flex",gap:8,alignItems:"flex-start",marginBottom:7}}>
                  <span style={{width:16,height:16,borderRadius:4,marginTop:1,flexShrink:0,border:`1.5px solid ${imp?C.amber:C.border}`}}/>
                  <span style={{fontSize:12,color:imp?C.text:C.mutedLight,fontWeight:imp?600:400,lineHeight:1.5}}>{imp&&<span style={{color:C.amber,marginRight:3}}>★</span>}{label}</span>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:10,marginTop:12}}>
              <button onClick={()=>{URL.revokeObjectURL(videoUrl);setVideoUrl(null);setTapTargetX(null);setShowTapGuide(false);}} style={{flex:1,padding:"11px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:10,color:C.muted,fontSize:13,cursor:"pointer",fontFamily:C.font}}>動画を変更</button>
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
          <div style={{background:C.amber+"12",border:`1.5px solid ${C.amber}44`,borderRadius:12,padding:"12px 14px",marginBottom:10}}>
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
      <div style={wrap}><GlassOrbs/><div style={maxW}><div style={{paddingTop:32}}>
        {/* ヘッダー：測定履歴へ戻るボタン追加 */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:28,height:28,borderRadius:"50%",background:C.accent+"1a",border:`1px solid ${C.accent}33`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>👤</div>
            <span style={{fontWeight:700,color:C.text}}>{patientName}</span>
            <span style={{fontSize:11,color:C.muted}}>— {patientHistory.length}回目 / {formatDate(patientHistory[0]?.date)}</span>
          </div>
          <button
            onClick={()=>{setHistoryPatient({id:patientId,name:patientName,history:patientHistory});setPhase("historyList");}}
            style={{padding:"6px 12px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,color:C.mutedLight,fontSize:12,cursor:"pointer",fontFamily:C.font,whiteSpace:"nowrap"}}
          >📋 測定履歴</button>
        </div>

        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:20,padding:"28px 20px",marginBottom:12,display:"flex",flexDirection:"column",alignItems:"center"}}>
          <ScoreArc score={result.score}/>
          <div style={{fontWeight:900,fontSize:17,marginTop:4,textAlign:"center"}}>{result.summary}</div>
          {patientHistory.length>1&&<ScoreHistoryChart history={patientHistory}/>}
        </div>
        {frames.length>0&&(<div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:"12px",marginBottom:12}}><div style={{fontSize:11,color:C.muted,marginBottom:8,letterSpacing:1}}>解析フレーム</div><FrameStrip frames={frames} current={currentFrame} onSelect={setCurrentFrame}/><img src={`data:image/jpeg;base64,${frames[currentFrame]?.b64}`} alt="selected" style={{width:"100%",borderRadius:8,marginTop:4,border:`1px solid ${C.border}`}}/></div>)}
        <div style={{display:"flex",gap:4,marginBottom:12,background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:4}}>
          {tabs.map(t=>(<button key={t.id} onClick={()=>setActiveTab(t.id)} style={{flex:1,padding:"8px 2px",background:activeTab===t.id?C.accent:"transparent",border:"none",borderRadius:8,color:activeTab===t.id?C.bgSolid:C.muted,fontSize:10,fontWeight:700,cursor:"pointer",transition:"all 0.2s",fontFamily:C.font,lineHeight:1.4}}>{t.icon}<br/>{t.label}</button>))}
        </div>
        {activeTab==="compare"&&(<div><ComparePanel current={result} prev={prevRecord}/>
        {patientHistory.length>1&&(<div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:14,padding:"16px 18px",marginBottom:10}}><div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:4}}>歩行指標の推移</div><GaitMetricsHistoryChart history={patientHistory}/></div>)}{patientHistory.length>2&&(<div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:14,padding:"16px 18px"}}><div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:10}}>測定履歴</div>{patientHistory.slice(0,5).map((h,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:i<Math.min(patientHistory.length,5)-1?`1px solid ${C.border}`:"none"}}><div style={{fontSize:11,color:C.muted,width:80,flexShrink:0}}>{formatDate(h.date)}</div><div style={{fontWeight:700,color:h.score>=75?C.accent:h.score>=50?C.amber:C.red,fontFamily:"'Space Mono',monospace",width:36}}>{h.score}</div><div style={{fontSize:12,color:C.mutedLight,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.summary}</div></div>))}</div>)}</div>)}
        {activeTab==="gait"&&result.gait&&(<div>{result.aids&&(<div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:14,padding:"16px 18px",marginBottom:10}}><div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:12}}>補助具・手すり</div><div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:result.aids.usage||result.aids.recommendation?12:0}}>{result.aids.detected&&result.aids.detected.length>0?result.aids.detected.map((a,i)=><span key={i} style={{background:C.blue+"1a",border:`1px solid ${C.blue}44`,color:C.blue,borderRadius:100,padding:"4px 12px",fontSize:12,fontWeight:700}}>🦯 {fixTerms(a)}</span>):<span style={{background:C.accent+"1a",border:`1px solid ${C.accent}33`,color:C.accent,borderRadius:100,padding:"4px 12px",fontSize:12,fontWeight:700}}>✓ 補助具なし</span>}</div>{result.aids.usage&&<div style={{background:C.surface,borderRadius:8,padding:"10px 12px",fontSize:12,color:C.text,lineHeight:1.6,marginBottom:8,borderLeft:`3px solid ${C.blue}`}}><span style={{color:C.mutedLight,fontSize:11,display:"block",marginBottom:3}}>使い方の評価</span>{fixTerms(result.aids.usage)}</div>}{result.aids.recommendation&&<div style={{background:C.amber+"0f",borderRadius:8,padding:"10px 12px",fontSize:12,color:C.text,lineHeight:1.6,borderLeft:`3px solid ${C.amber}`}}><span style={{color:C.amber,fontSize:11,display:"block",marginBottom:3}}>💡 アドバイス</span>{fixTerms(result.aids.recommendation)}</div>}</div>)}<div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:14,padding:"20px 18px"}}><div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:16}}>GAIT METRICS</div><GaitRadarChart gait={result.gait}/></div></div>)}
        {activeTab==="issues"&&(<div style={{display:"flex",flexDirection:"column",gap:8}}>{(result.issues||[]).map((issue,i)=>(<div key={i} style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px"}}><div style={{display:"flex",alignItems:"flex-start",gap:4,marginBottom:6}}><SeverityDot s={issue.severity}/><span style={{fontWeight:700,fontSize:14}}>{issue.title}</span></div><p style={{margin:0,fontSize:13,color:C.mutedLight,lineHeight:1.65,paddingLeft:13}}>{issue.detail}</p></div>))}</div>)}
        {activeTab==="exercises"&&(<div>{patientHistory.length>1&&<div style={{fontSize:11,color:C.muted,marginBottom:10,background:C.panel,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px"}}>💬 前回の体操履歴をもとに進捗に合わせた内容を提案しています</div>}{(result.exercises||[]).map((ex,i)=><ExerciseCard key={i} ex={ex} idx={i}/>)}</div>)}
        {activeTab==="lifestyle"&&(<div style={{display:"flex",flexDirection:"column",gap:8}}>{(result.lifestyle||[]).map((tip,i)=>(<div key={i} style={{display:"flex",gap:12,alignItems:"flex-start",background:C.panel,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px"}}><span style={{width:26,height:26,borderRadius:8,background:C.accent+"1a",color:C.accent,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:12,flexShrink:0}}>{i+1}</span><p style={{margin:0,fontSize:13,color:C.text,lineHeight:1.7}}>{tip}</p></div>))}</div>)}
        <div style={{display:"flex",gap:10,marginTop:20}}>
          <button onClick={handleResultPrint} style={{flex:1,padding:"13px",background:`linear-gradient(135deg,${C.accent},${C.accentDim})`,border:"none",borderRadius:12,color:C.bgSolid,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:C.font,boxShadow:`0 4px 20px ${C.accent}33`}}>🖨️ 印刷 / PDF保存</button>
        </div>
        <button onClick={restart} style={{width:"100%",marginTop:10,padding:"13px",background:"transparent",border:`1.5px solid ${C.border}`,borderRadius:12,color:C.muted,fontSize:14,cursor:"pointer",fontFamily:C.font}}>別の動画で再解析</button>
      </div></div></div>
    );
  }

  // ── LOADING ───────────────────────────────────────────────────────────────
  if (phase==="loading") return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
      <GlassOrbs/>
      <div style={{color:C.accent,fontSize:16,fontFamily:C.font,position:"relative",zIndex:1}}>読み込み中...</div>
    </div>
  );
  return null;
}