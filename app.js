const $=id=>document.getElementById(id);
const KEY='hacchu.db.v3', GAS_KEY='hacchu.gas.url', LOC_KEY='hacchu.loc';
const Storage=window.HacchuStorage;
const DEFAULT_LOC={lat:36.1214,lon:139.6015,name:'加須市(埼玉県)'};
const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbwU6-Ut_7ChPXtVr5fOEq5iPd7m0G5VNkcMJ8g27XQ_aBv2t0S-WUJNtmtoUYDqyZ4V/exec';
const PREVIOUS_GAS_URL = 'https://script.google.com/macros/s/AKfycbypnSUGdcjGtZIDdnKXZ5jCkmJ-G0wjjVBb8An-Chqyp-PDXXjoDEwTLVXdY36w2m74/exec';
const LEGACY_GAS_URL = 'https://script.google.com/macros/s/AKfycbxtaQ-NAYOwLHK418teJrMXqC9W2THI4qXTf-0iWXQ24oNZBKTglLNZvKU-HloUDGe6/exec';


const b64e=s=>btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const b64d=s=>new TextDecoder().decode(Uint8Array.from(atob(s),c=>c.charCodeAt(0)));

let DB=null, MODE='o', SORT=false, EDIT=null, APP_TAB='onigiri', ITEM_PAGE=0;
let BOOT_HAD_LOCAL_DB=false;
const ITEMS_PER_PAGE=6;
let DRIVE_FILES=[];
let LAST_CAPTURED_FILE=null, LAST_AI_PROMPT='';

function blank(name,icon){return{name,icon,items:[],hist:[],tgt:{},dow:{...DOW0},rat:JSON.parse(JSON.stringify(RAT0)),
  base:0,up:1,cur:{dt:'',v:{}}}}
function fresh(){const g={};GEN.forEach(([k,n,i])=>{g[k]=blank(n,i);if(typeof SEED!=='undefined'&&SEED[k])Object.assign(g[k],SEED[k])});return{v:3,active:'onigiri',memoDisplay:true,g}}
/* GENに定義された全カテゴリがDBに存在するよう補完する。
   クラウド読込や取り込みで古い構成のデータが入っても、新カテゴリが消えないようにする */
function ensureCategories(){
  if(!DB||!DB.g)return;
  GEN.forEach(([k,n,i])=>{
    if(!DB.g[k]){
      DB.g[k]=blank(n,i);
      if(typeof SEED!=='undefined'&&SEED[k])Object.assign(DB.g[k],SEED[k]);
    }else{ DB.g[k].name=n; DB.g[k].icon=i; }
  });
  if(!DB.g[DB.active])DB.active=GEN[0][0];
}
/* 一時的に追加したメモ表示テストデータを削除する。 */
function cleanMemoDisplayTest(){
  let changed=false;
  Object.values(DB.g||{}).forEach(g=>{
    const before=(g.hist||[]).length;
    g.hist=(g.hist||[]).filter(h=>!String(h.m||'').startsWith('【テスト】'));
    if(g.hist.length!==before)changed=true;
  });
  if(DB.memoDisplayTestV1!==undefined){delete DB.memoDisplayTestV1;changed=true}
  if(changed)save();
}
/* 写真で確認できたおむすびの日別実績を一度だけ補完する。 */
/* ジャンルごとの便構成の既定値を、すでにそのジャンルがある端末にも入れる。
   ユーザーが設定済みの場合は上書きしない。
   bins=そのジャンルで使う便（未指定なら1〜3便すべて） */
const GEN_BIN_DEFAULTS={
  dessert:{bins:[0,1],note:'ヤマパン＝1便／ファミマ＝2便のみ'},
  hiyashi:{bins:[1,2],note:'2便・3便のみ'},
  pasta:{note:'商品により1便・3便、または2便のみ（商品ごとに品揃えマスターで設定）'}
};
function applyGenreBinDefaults(){
  let ch=false;
  Object.entries(GEN_BIN_DEFAULTS).forEach(([k,d])=>{
    const g=DB.g&&DB.g[k];if(!g)return;
    if(d.bins&&!Array.isArray(g.bins)){g.bins=d.bins.slice();ch=true}
    if(d.note&&!g.binNote){g.binNote=d.note;ch=true}
  });
  if(ch)save();
}
function applyPhotoActualFix(){
  if(DB.photoActualFixV1)return;
  const g=DB.g&&DB.g.onigiri;if(!g)return;
  const y=new Date().getFullYear();
  const fixes=[
    {d:'8/19',n:135,s:130,ha:2},
    {d:'8/20',n:186,s:140,ha:15}
  ];
  fixes.forEach(f=>{
    const old=g.hist.find(h=>h.d===f.d&&(h.y||y)===y);
    if(old)Object.assign(old,f,y?{y}:{});
    else g.hist.push({...f,y});
  });
  g.hist.sort((a,b)=>{const p=s=>{const m=(s.d||'').match(/(\d+)\D+(\d+)/);return m?+m[1]*100+ +m[2]:0};return p(a)-p(b)});
  DB.photoActualFixV1=true;DB.pendingSync=true;save();
}
let STORAGE_WARNING='';
function load(){try{const result=Storage.loadDb();if(result.db){DB=result.db;STORAGE_WARNING=result.warning||'';return true}}
  catch(e){STORAGE_WARNING=e.message||'保存データを読み取れませんでした'}
  return false}
function save(options={}){try{
    const dirty=options.dirty!==false;
    if(dirty)DB.pendingSync=true;
    Storage.saveDb(DB,localStorage,options.now||Date.now());
    $('st').textContent=(DB.ts!==DB.syncedTs?'未同期 ':'保存 ')+hm()}
  catch(e){$('st').textContent='保存エラー';console.error(e)}}
function hm(){const n=new Date();return String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0')}
function flash(t){$('st').textContent=t;
  setTimeout(()=>$('st').textContent=(DB&&DB.ts!==DB.syncedTs?'未同期 ':'保存 ')+hm(),2500)}
let sT=null;const autosave=()=>{clearTimeout(sT);sT=setTimeout(save,400)};
const G=()=>DB.g[DB.active];
function dlg(id){
  saveOrderDateDraft();save();
  if(id==='dSet')renderSet();
  if(id==='dMaster'){
    const sel=$('bm_gen');if(sel&&sel.options.length)sel.value=DB.active;
    renderBinMx();
  }
  $(id).showModal()
}
function openMasterFromSettings(){
  $('dSet').close();
  dlg('dMaster');
}
function openCatalogFromSettings(){
  $('dSet').close();
  openCatalog();
}
function toggleSettingsAdvanced(){
  const els=document.querySelectorAll('.settingsAdvanced');
  const show=Array.from(els).some(el=>el.style.display==='none');
  els.forEach(el=>el.style.display=show?'':'none');
  const b=$('settingsAdvancedBtn');
  if(b)b.textContent=show?'詳細設定を隠す':'詳細設定を表示';
}
function setMemoDisplay(on){
  DB.memoDisplay=!!on;save();renderMemoDisplaySetting();renderMainMemos();
}
function toggleMemoDisplay(){setMemoDisplay(DB.memoDisplay===false)}
function renderMemoDisplaySetting(){
  const on=DB.memoDisplay!==false;
  const b=$('memoDisplayToggle'),s=$('memoDisplayStatus');
  if(b){b.setAttribute('aria-pressed',String(on));b.textContent=on?'メモ表示：ON':'メモ表示：OFF';b.className=on?'sm':'gh sm'}
  if(s)s.textContent=on?'現在：表示（次回起動後も表示）':'現在：非表示（次回起動後も非表示）';
}
function toggleTheme(){const r=document.documentElement;
  r.setAttribute('data-theme',r.getAttribute('data-theme')==='dark'?'light':'dark')}

/* ---------- 天気の自動取得（Open-Meteo：APIキー不要） ---------- */
function getLoc(){try{return JSON.parse(localStorage.getItem(LOC_KEY)||'null')||DEFAULT_LOC}catch(e){return DEFAULT_LOC}}
function setLoc(v){localStorage.setItem(LOC_KEY,JSON.stringify(v))}
async function searchLoc(){
  const name=$('loc_name').value.trim();
  if(!name){alert('地域名を入れてください');return}
  $('loc_status').textContent='検索中...';
  try{
    const res=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=ja&format=json`);
    const data=await res.json();
    const r=data.results&&data.results[0];
    if(!r){$('loc_status').textContent='見つかりませんでした';return}
    setLoc({lat:r.latitude,lon:r.longitude,name:r.name+(r.admin1?'('+r.admin1+')':'')});
    $('loc_status').textContent='設定済み: '+getLoc().name;
    flash('地域を保存しました');
  }catch(e){$('loc_status').textContent='検索に失敗しました（通信環境をご確認ください）'}
}
function wmoLabel(c){
  if(c===0||c===1)return '晴';
  if(c===2||c===3||c===45||c===48)return '曇';
  if([71,73,75,77,85,86].includes(c))return '雪';
  if([51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99].includes(c))return '雨';
  return '曇'}
/* 日付文字列("8/21"等)→ "YYYY-MM-DD"。年をまたぐ入力も前後1年の近い方に寄せる */
function ymdOf(d){
  const m=(d||'').trim().match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})/);
  if(!m)return null;
  const now=new Date(),mo=+m[1],da=+m[2];
  let y=now.getFullYear();
  // 12月に「1/3」を入れたら翌年、1月に「12/28」を入れたら前年とみなす
  if(now.getMonth()+1>=11&&mo<=2)y++;
  else if(now.getMonth()+1<=2&&mo>=11)y--;
  return y+'-'+String(mo).padStart(2,'0')+'-'+String(da).padStart(2,'0')}

/* 取得済みの天気はローカルに貯めておく（日付を送り戻しても即表示・通信を減らす） */
const WX_KEY='hacchu.wx.v1';
function wxCache(){try{return JSON.parse(localStorage.getItem(WX_KEY)||'{}')}catch(e){return {}}}
function wxGet(k){const c=wxCache();return c[k]||null}
function wxPut(k,v){const c=wxCache();c[k]=v;
  // 古いものから間引いて上限400件
  const ks=Object.keys(c);if(ks.length>400)ks.slice(0,ks.length-400).forEach(x=>delete c[x]);
  try{localStorage.setItem(WX_KEY,JSON.stringify(c))}catch(e){}}

/* 指定日の「朝◯/昼◯/夕◯」を返す。過去日は確定値、未来日は予報。取れなければ null */
async function weatherForDate(dateStr){
  const loc=getLoc();if(!loc||!dateStr)return null;
  const key=loc.lat.toFixed(3)+','+loc.lon.toFixed(3)+'@'+dateStr;
  const today=new Date();today.setHours(0,0,0,0);
  const isPast=new Date(dateStr+'T00:00:00')<today;
  // 過去日は確定値なので一度取れたら使い回す。未来日は予報が変わるのでキャッシュしない
  if(isPast){const c=wxGet(key);if(c)return c}
  const q=`latitude=${loc.lat}&longitude=${loc.lon}&hourly=weathercode&timezone=Asia%2FTokyo&start_date=${dateStr}&end_date=${dateStr}`;
  // 予報API（過去92日〜未来16日）→ ダメなら過去データAPI（何年前でも可・約5日遅れ）
  const urls=isPast
    ? [`https://api.open-meteo.com/v1/forecast?${q}`,`https://archive-api.open-meteo.com/v1/archive?${q}`]
    : [`https://api.open-meteo.com/v1/forecast?${q}`];
  for(const url of urls){
    try{
      const res=await fetch(url);
      const data=await res.json();
      const codes=data.hourly&&data.hourly.weathercode;
      if(!codes||codes.length<18||codes[7]==null||codes[12]==null||codes[17]==null)continue;
      // 朝(7時=1便の売れ筋帯)/昼(12時=2便)/夕(17時=3便)の3時点で代表させる
      const v=`朝${wmoLabel(codes[7])}/昼${wmoLabel(codes[12])}/夕${wmoLabel(codes[17])}`;
      if(isPast)wxPut(key,v);
      return v;
    }catch(e){}
  }
  return null}

async function fetchWeather(){
  setActionOrderDate();
  const loc=getLoc();
  if(!loc){alert('先に「設定」から地域を登録してください');dlg('dSet');return}
  const dateStr=ymdOf($('dt').value);
  if(!dateStr){alert('納品日を「8/21」のように入力してください');return}
  flash('天気を取得中...');
  const v=await weatherForDate(dateStr);
  if(!v){alert('天気の取得に失敗しました（通信環境、または対応範囲外の日付です）');flash('取得失敗');return}
  $('wthr').value=v;
  G().cur.wthr=v;renderSetup();autosave();
  flash('天気を取得しました');
}

/* 実績記録の日付が変わるたび、その日の確定天気を自動で入れる */
let HW_SEQ=0;
async function autoHistWeather(d,force){
  const el=$('h_wsts');const seq=++HW_SEQ;
  const dateStr=ymdOf(d);
  if(!dateStr){if(el)el.textContent='';return}
  if(el){el.className='note';el.textContent='天気を取得中...'}
  const v=await weatherForDate(dateStr);
  if(seq!==HW_SEQ)return;                      // 連打で日付が進んだら古い結果は捨てる
  if(!v){if(el){el.className='note';el.textContent='天気は取得できませんでした（手入力できます）'}return}
  const today=new Date();today.setHours(0,0,0,0);
  const label=new Date(dateStr+'T00:00:00')<today?'確定の天気':'予報';
  if(force||!$('h_w').value.trim()){
    $('h_w').value=v;
    if(el){el.className='note ok';el.textContent=`🌤 ${label}を自動入力しました`}
  }else if($('h_w').value.trim()===v){
    if(el){el.className='note ok';el.textContent=`🌤 ${label}と一致`}
  }else{
    if(el){el.className='note';el.textContent=`🌤 ${label}は「${v}」（🌤ボタンで上書き）`}
  }
}

/* ---------- クラウド同期 (CORS完全回避版) ---------- */
function getGasUrl(){
  const saved=localStorage.getItem(GAS_KEY);
  return !saved||saved===LEGACY_GAS_URL||saved===PREVIOUS_GAS_URL?DEFAULT_GAS_URL:saved;
}
function saveGasUrl(){const u=$('gas_url').value.trim();localStorage.setItem(GAS_KEY,u);flash('同期URL保存');alert('同期URLを設定しました')}

function fetchCloudDb(timeoutMs=10000){
  return new Promise((resolve,reject)=>{
    const url=getGasUrl();
    const cb='gasVerify_'+Date.now()+'_'+Math.random().toString(36).slice(2);
    const script=document.createElement('script');let done=false;
    const finish=(fn,value)=>{if(done)return;done=true;clearTimeout(timer);delete window[cb];if(script.parentNode)script.parentNode.removeChild(script);fn(value)};
    const timer=setTimeout(()=>finish(reject,new Error('クラウド確認がタイムアウトしました')),timeoutMs);
    window[cb]=data=>finish(resolve,data);
    script.onerror=()=>finish(reject,new Error('クラウド確認に失敗しました'));
    script.src=url+(url.includes('?')?'&':'?')+'callback='+cb+'&t='+Date.now();
    document.body.appendChild(script);
  });
}

async function verifyCloudSave(expectedTs){
  let lastError=null;
  for(let attempt=0;attempt<3;attempt++){
    try{
      const data=await fetchCloudDb(8000);
      if(data&&Number(data.ts)===Number(expectedTs))return data;
      lastError=new Error('クラウドの更新時刻が一致しません');
    }catch(e){lastError=e}
    if(attempt<2)await new Promise(resolve=>setTimeout(resolve,700));
  }
  throw lastError||new Error('クラウド保存を確認できませんでした');
}

function restoreLastLocalData(){
  try{
    const d=Storage.loadRecoveryDb();
    const hist=Object.values(d.g||{}).reduce((a,g)=>a+((g.hist||[]).length),0);
    const when=d.ts?new Date(d.ts).toLocaleString('ja-JP'):'時刻不明';
    if(!confirm(`直前の端末データへ戻しますか？\n\n保存時刻: ${when}\n実績: ${hist}件\n\n現在の表示内容は直前バックアップへ退避されます。`))return;
    DB=d;DB.pendingSync=true;ensureCategories();save();renderAll();
    $('dSet').close();
    alert('直前の端末データを復元しました。内容を確認するまで同期しないでください。');
  }catch(e){alert(e.message||'直前データを復元できませんでした')}
}

async function cloudSave(){
  const url=getGasUrl();
  if(!url){alert('先に「設定」からGASウェブアプリURLを登録してください');dlg('dSet');return}
  $('st').textContent='保存中...';
  try{
    await fetch(url,{
      method:'POST',
      mode:'no-cors',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify(DB)
    });
    flash('☁️ クラウド保存完了');
  }catch(e){alert('クラウド保存に失敗しました');flash('保存失敗')}
}

/* 同期＝端末保存＋クラウド保存を1ボタンで。失敗時は端末保存のままにして後で再同期 */
async function syncCloud(){
  clearTimeout(sT);sT=null;
  saveOrderDateDraft();
  save();
  const url=getGasUrl();
  if(!url){alert('先に「設定」からGASウェブアプリURLを登録してください');dlg('dSet');return}
  // 空データでクラウドを上書きしてしまう事故を防ぐ
  const totalItems=Object.values(DB.g||{}).reduce((a,g)=>a+((g.items||[]).length),0);
  const totalHist=Object.values(DB.g||{}).reduce((a,g)=>a+((g.hist||[]).length),0);
  if(totalItems===0&&totalHist===0){
    if(!confirm('この端末のデータが空です。このまま同期するとクラウドのデータが空で上書きされます。\n\n（データを取り戻したい場合は「キャンセル」→設定→「クラウドから読み込む（復元）」を押してください）\n\n本当に空のまま同期しますか？'))return;
  }
  $('st').textContent='同期中...';
  try{
    const syncTs=Date.now();
    const localTs=DB.ts;
    const payload=JSON.parse(JSON.stringify(DB));
    payload.pendingSync=false;payload.ts=syncTs;payload.syncedTs=syncTs;
    await fetch(url,{method:'POST',mode:'no-cors',
      headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload)});
    await verifyCloudSave(syncTs);
    if(DB.ts!==localTs){
      DB.pendingSync=true;save();
      flash('⚠ 同期中の新しい入力が未同期です');
      return;
    }
    DB.pendingSync=false;DB.ts=syncTs;DB.syncedTs=syncTs;
    save({dirty:false,now:syncTs});
    flash(`☁️ ${G().name} ${G().cur.dt||$('dt').value||''} 同期確認済み`);
  }catch(e){
    DB.pendingSync=true;save();
    flash('⚠ 端末保存済み・クラウド未確認');
    alert('クラウドへの保存を確認できませんでした。入力内容はこの端末に保存されています。通信を確認して、もう一度「☁️ 同期」を押してください。');
  }
}

/* 起動時：クラウドの方が新しければ自動で読み込む（他の人の端末で同期された更新を反映）
   syncedTs＝最後にこの端末が同期した時点のts。クラウドのtsがそれと違えば
   「他の端末で更新された」と判断して取り込む */
function cloudLoadSilent(){
  const url=getGasUrl();if(!url)return;
  const cb='gasBoot_'+Date.now();
  const s=document.createElement('script');
  window[cb]=function(data){
    delete window[cb];if(s.parentNode)s.parentNode.removeChild(s);
    if(!data||!data.g)return;
    const decision=Storage.shouldAcceptCloudDb(DB,data,{hadLocalDb:BOOT_HAD_LOCAL_DB});
    if(decision.accept){
      const keepUrl=localStorage.getItem(GAS_KEY);
      const keepGen=DB.active;
      const cloudTs=data.ts||Date.now();
      DB=data;DB.ts=cloudTs;DB.syncedTs=cloudTs;DB.pendingSync=false;ensureCategories();
      if(keepGen&&DB.g[keepGen])DB.active=keepGen;   // 見ていたジャンルを保つ
      else if(!DB.active||!DB.g[DB.active])DB.active='onigiri';
      save({dirty:false,now:cloudTs});
      if(keepUrl)localStorage.setItem(GAS_KEY,keepUrl);
      renderAll();flash('☁️ 最新データを反映');
    }
  };
  s.src=url+(url.includes('?')?'&':'?')+'callback='+cb+'&t='+Date.now();
  s.onerror=function(){delete window[cb];if(s.parentNode)s.parentNode.removeChild(s)};
  document.body.appendChild(s);
}

function cloudLoad(){
  const url=getGasUrl();
  if(!url){alert('先に「設定」からGASウェブアプリURLを登録してください');dlg('dSet');return}
  $('st').textContent='読込中...';
  
  const cbName = 'gasCallback_' + Date.now();
  let done=false;
  const timer=setTimeout(()=>{
    if(done)return;done=true;
    delete window[cbName];
    if(script.parentNode) script.parentNode.removeChild(script);
    alert('クラウドから応答がありませんでした。通信環境かGASのデプロイ設定をご確認ください。');
    flash('読込タイムアウト');
  },15000);
  window[cbName] = function(data){
    if(done)return;done=true;clearTimeout(timer);
    delete window[cbName];
    if(script.parentNode) script.parentNode.removeChild(script);
    const cloudN=data&&data.g?Object.values(data.g).reduce((a,g)=>a+((g.items||[]).length),0):0;
    if(data && data.g && cloudN===0){
      alert('クラウドのデータが空でした（商品0品）。\n復元できるデータがないため、この端末のデータはそのままにします。');
      flash('読込(空)');
      return;
    }
    if(data && data.g){
      const keepUrl=localStorage.getItem(GAS_KEY);
      DB = data;
      ensureCategories();
      const cloudTs=data.ts||Date.now();
      DB.ts=cloudTs;
      DB.syncedTs = cloudTs;
      DB.pendingSync = false;
      save({dirty:false,now:cloudTs});
      if(keepUrl)localStorage.setItem(GAS_KEY,keepUrl);
      renderAll();
      $('dSet').close();
      const n=Object.values(DB.g||{}).reduce((a,g)=>a+((g.items||[]).length),0);
      flash('☁️ 読込完了');
      alert(`クラウドから読み込みました（商品${n}品）`);
    }else{
      alert('Googleドライブに有効なデータがありませんでした');
      flash('読込完了(空)');
    }
  };
  
  const script = document.createElement('script');
  script.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cbName + '&t=' + Date.now();
  script.onerror = function(){
    if(done)return;done=true;clearTimeout(timer);
    delete window[cbName];
    if(script.parentNode) script.parentNode.removeChild(script);
    alert('クラウド読込に失敗しました。GASのデプロイ設定をご確認ください。');
    flash('読込失敗');
  };
  document.body.appendChild(script);
}

/* ---------- 写真OCR読み取り処理 ---------- */
async function handleImage(input){
  if(!input.files||!input.files[0])return;
  const file=input.files[0];
  const st=$('ocrst');
  if(typeof Tesseract==='undefined'){
    st.className='note crit';
    st.textContent='✕ 文字解析ライブラリを読み込めませんでした。通信環境をご確認のうえページを再読み込みしてください。';
    input.value='';
    return;
  }
  st.className='note warn';
  st.textContent='解析中... 0%（写真の内容により10〜30秒ほどかかります）';
  $('st').textContent='解析中...';
  try{
    const res=await Tesseract.recognize(file,'jpn+eng',{
      logger:m=>{
        if(m.status==='recognizing text'){
          st.textContent=`解析中... ${Math.round((m.progress||0)*100)}%`;
        }
      }
    });
    const txt=res.data.text;
    $('out').value="【写真から読み取ったテキスト】\n"+txt;
    $('out').scrollIntoView({behavior:'smooth',block:'center'});
    st.className='note ok';
    st.textContent='✓ 解析完了。下の書き出し枠にテキストを入れました。コピーしてAIチャットに貼ってください。';
    flash('写真解析完了');
  }catch(e){
    st.className='note crit';
    st.textContent='✕ 写真の読み取りに失敗しました：'+(e&&e.message?e.message:'不明なエラー');
    flash('解析失敗');
  }
  input.value='';
}

/* ---------- 曜日・マニュアル公式学習 ---------- */
function dowOf(t){t=(t||'').trim();let m=t.match(/[（(]?([月火水木金土日])[）)]?/);if(m)return m[1];
  m=t.match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})/);
  if(m){
    const now=new Date(),curM=now.getMonth()+1,inM=+m[1];
    let y=now.getFullYear();
    if(curM>=11&&inM<=2)y++;
    return '日月火水木金土'[new Date(y,inM-1,+m[2]).getDay()]}
  return null}
/* AI推奨は学習データからGW/お盆/年末年始を除外しているため、この期間は意思入れが必須（マニュアル準拠） */
function specialPeriod(t){
  const m=(t||'').trim().match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})/);
  if(!m)return null;
  const mo=+m[1],d=+m[2];
  if((mo===4&&d>=29)||(mo===5&&d<=5))return 'GW';
  if(mo===8&&d>=13&&d<=16)return 'お盆';
  if((mo===12&&d>=29)||(mo===1&&d<=3))return '年末年始';
  return null}
/* ストコンAI推奨値は1日に複数回配信される。今の時刻でどの版が最新かと、
   次にいつ更新されるかを返す（深夜勤務で前夜の版を見ているケースを明示するため） */
function aiVersionNow(){
  const n=new Date(), t=n.getHours()*60+n.getMinutes();
  if(t<450)  return{cur:'18時版', next:'7:30',  nextMin:450,  note:'前夜18時配信の版が最新'};
  if(t<780)  return{cur:'7:30版', next:'13:00', nextMin:780,  note:'当日7:30配信の版が最新'};
  if(t<1080) return{cur:'13:00版',next:'18:00', nextMin:1080, note:'当日13:00配信の版が最新'};
  return{cur:'18時版', next:'翌7:30', nextMin:null, note:'18時配信の版が最新'};
}
function learnDow(){const g=G(),by={},all=[];
  g.hist.forEach(h=>{const d=dowOf(h.d);if(!d||h.s==null)return;(by[d]=by[d]||[]).push(h.s);all.push(h.s)});
  if(all.length<7)return null;
  const avg=all.reduce((a,b)=>a+b,0)/all.length,out={},cnt={};
  Object.keys(by).forEach(d=>{if(by[d].length>=2){out[d]=+(by[d].reduce((a,b)=>a+b,0)/by[d].length/avg).toFixed(3);cnt[d]=by[d].length}});
  return Object.keys(out).length>=4?{f:out,cnt}:null}
function dowInfo(){const d=dowOf($('dt').value);if(!d)return null;
  const L=learnDow(),g=G();
  const f=(L&&L.f[d])||g.dow[d]||1, src=(L&&L.f[d])?('自店'+L.cnt[d]+'日から学習'):'初期値';
  const r=d==='土'?g.rat.sat:d==='日'?g.rat.sun:g.rat.weekday;
  return{d,f,r,src,type:d==='土'?'土曜型':d==='日'?'日曜型':'平日型'}}
const WTHR_F={'晴':1.05,'曇':0.97,'雨':0.90,'雪':0.82};
function weatherFactor(t,r){t=(t||'').trim();if(!t)return 1;
  const m=t.match(/朝(晴|曇|雨|雪).*昼(晴|曇|雨|雪).*夕(晴|曇|雨|雪)/);
  if(m){const w=r?[r[0]/100,r[1]/100,r[2]/100]:[1/3,1/3,1/3];
    return WTHR_F[m[1]]*w[0]+WTHR_F[m[2]]*w[1]+WTHR_F[m[3]]*w[2]}
  if(/雪/.test(t))return 0.82;
  if(/雨/.test(t))return 0.90;
  if(/曇/.test(t))return 0.97;
  if(/晴/.test(t))return 1.05;
  return 1}
function learnedDemandBase(g){
  const today=(()=>{const d=new Date();return (d.getMonth()+1)+'/'+d.getDate()})();
  const daily=(g.hist||[]).filter(h=>h.s!=null&&h.d!==today&&!specialPeriod(h.d)).slice(-28).map(h=>Number(h.s)).filter(Number.isFinite);
  if(daily.length>=7){
    const avg=daily.reduce((a,b)=>a+b,0)/daily.length;
    return{value:+avg.toFixed(1),source:`日別販売実績${daily.length}日から学習`,kind:'daily'};
  }
  const tue=(g.snap||[]).filter(s=>s.type==='tue'&&Array.isArray(s.items)).slice(-1)[0];
  if(tue){
    const values=tue.items.map(x=>Array.isArray(x.ws)?Number(x.ws[x.ws.length-1]):NaN).filter(Number.isFinite);
    if(values.length){
      const weekly=values.reduce((a,b)=>a+b,0);
      return{value:+(weekly/7).toFixed(1),source:`${tue.week}週の商品販売${values.length}品から学習`,kind:'weekly'};
    }
  }
  const manual=Number(g.base)||0;
  return manual?{value:manual,source:'設定の基準日販',kind:'manual'}:null;
}
function forecastReadiness(g){
  const hist=(g.hist||[]).filter(h=>h.s!=null).length;
  const weeks=[...new Set((g.snap||[]).filter(s=>s.type==='tue').map(s=>s.week))].length;
  const items=(g.items||[]).length;
  const withDay=(g.items||[]).filter(r=>Number(r.day)>0||itemTrend(g,r.name).length).length;
  const base=learnedDemandBase(g);
  return{hist,weeks,items,withDay,base,ready:!!(base&&items&&withDay)};
}
function demand(){
  const g=G(),i=dowInfo();if(!i)return null;
  const learned=learnedDemandBase(g);if(!learned)return null;
  const b=learned.value;
  let up=Number(g.up)||1;
  if(DB.active==='chilled'&&i.d==='月'){up*=1.5}
  const wf=weatherFactor($('wthr').value,i.r);
  return{q:Math.round(b*i.f*up*wf),
    src:`基準日販${b}個（${learned.source}）× ${i.d}曜${i.f.toFixed(2)}`+(up!==1?` × 倍率${up.toFixed(2)}`:'')+(wf!==1?` × 天気${wf.toFixed(2)}`:''),
    learned}}
function applyDow(){const i=dowInfo();if(!i)return null;
  $('r1').value=i.r[0];$('r2').value=i.r[1];$('r3').value=i.r[2];
  // 使わない便は配分欄も隠し、その分を0にして他の便へ回す
  const B=binsUsed();
  [1,2,3].forEach(n=>{const use=B.includes(n-1);
    $('rw'+n).style.display=use?'':'none';
    if(!use)$('r'+n).value=0});
  return i}
/* 納品日ごとの入力途中データ。日付移動では確定履歴にせず、
   カテゴリ内の下書きとして保持する。 */
function orderDateParts(d){
  const m=(d||'').trim().match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})/);
  return m?{mo:+m[1],da:+m[2]}:null
}
function orderDateText(date){return (date.getMonth()+1)+'/'+date.getDate()}
function cloneOrderState(v){return JSON.parse(JSON.stringify(v||{}))}
function saveOrderDateDraft(){
  const g=G(),d=(g.cur.dt||$('dt').value||'').trim();
  if(!orderDateParts(d))return;
  g.dateDrafts=g.dateDrafts||{};
  g.dateDrafts[d]={v:cloneOrderState(g.cur.v),wthr:g.cur.wthr||'',
    ai:Array.isArray(g.cur.ai)?g.cur.ai.slice():[null,null,null],aiVer:g.cur.aiVer||'',
    carry:g.cur.carry??null,plan:g.cur.plan??null,stockItems:g.cur.stockItems??null,
    carryBin:Array.isArray(g.cur.carryBin)?g.cur.carryBin.slice():null,
    stockSrc:g.cur.stockSrc||''};
}
function loadOrderDate(d){
  const g=G();if(!orderDateParts(d))return;
  g.dateDrafts=g.dateDrafts||{};
  const old=g.dateDrafts[d];
  g.cur.dt=d;
  g.cur.v=old?cloneOrderState(old.v):{};
  g.cur.wthr=old?old.wthr:'';
  g.cur.ai=old&&Array.isArray(old.ai)?old.ai.slice():[null,null,null];
  g.cur.aiVer=old?old.aiVer:'';
  g.cur.carry=old?(old.carry??null):null;
  g.cur.plan=old?(old.plan??null):null;
  g.cur.stockItems=old?(old.stockItems??null):null;
  g.cur.carryBin=old&&Array.isArray(old.carryBin)?old.carryBin.slice():null;
  g.cur.stockSrc=old?(old.stockSrc||''):'';
  $('tq').value='';$('ta').value='';
  renderAll();
  autosave();
}
function shiftOrderDate(dir){
  const p=orderDateParts($('dt').value)||orderDateParts(G().cur.dt);
  const now=new Date(),base=p?new Date(now.getFullYear(),p.mo-1,p.da):new Date();
  saveOrderDateDraft();
  base.setDate(base.getDate()+dir);
  loadOrderDate(orderDateText(base));
}
/* 同期・天気取得を押した時の業務日付。
   15:00までは当日、15:00以降は翌日を対象にする。 */
function setActionOrderDate(){
  const d=new Date();
  if(d.getHours()>=15)d.setDate(d.getDate()+1);
  const target=orderDateText(d);
  if(($('dt').value||'').trim()===target&&G().cur.dt===target)return target;
  saveOrderDateDraft();
  loadOrderDate(target);
  return target;
}
function tgtKey(){const m=($('dt').value||'').match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})/);return m?(+m[1]+'/'+ +m[2]):null}

/* ---------- 集計・AI採用率 ---------- */
const vv=(id,m)=>{const o=G().cur.v[id];return (o&&o[m])||[null,null,null]};
function setV(id,m,i,x){const c=G().cur.v;c[id]=c[id]||{o:[null,null,null],i:[null,null,null],a:[null,null,null]};
  c[id][m]=c[id][m]||[null,null,null];c[id][m][i]=x}
function sums(m){const g=G(),b=[0,0,0];let amt=0,n=0;
  g.items.forEach(r=>{const v=vv(r.id,m);if(!v.some(x=>x!==null))return;
    let rt=0;v.forEach((x,i)=>{if(itemBins(r,G()).includes(i)){b[i]+=(x||0);rt+=(x||0)}});
    amt+=(r.price||0)*rt;if(rt)n++});
  return{b,T:b[0]+b[1]+b[2],amt,n}}

function getAiAdoption(){
  const g=G();let match=0,total=0;
  g.items.forEach(r=>{
    const vo=vv(r.id,'o'), vi=vv(r.id,'i');
    if(vi.some(x=>x!==null)){
      total++;
      if(vo[0]===vi[0]&&vo[1]===vi[1]&&vo[2]===vi[2]) match++;
    }
  });
  if(!total) return null;
  const rate=Math.round((match/total)*100);
  let label='提案どおりが中心', cls='ok';
  if(rate<40){label='提案から大きく調整して発注';cls='warn'}
  else if(rate<70){label='一部を調整して発注';cls='ok'}
  return {rate,label,cls,match,total};
}

/* 便別繰越の表示。ジャンルで使う便だけを出す */
function carryBinText(g){
  g=g||G();
  const b=g.cur.carryBin;
  if(!Array.isArray(b)||!b.some(x=>x!=null))return '';
  return binsUsed(g).map(i=>`${i+1}便 ${b[i]==null?'—':b[i]}`).join(' / ');
}
/* ---------- 描画 ---------- */
function selectAppTab(tab){
  APP_TAB=tab;
  const panels={onigiri:'panelOnigiri',profit:'panelProfit',camera:'panelCamera'};
  Object.entries(panels).forEach(([key,id])=>{
    const el=$(id);if(el)el.hidden=key!==tab;
  });
  document.querySelectorAll('#tabs .tab').forEach(b=>
    b.setAttribute('aria-selected',String(b.dataset.tab===tab)));
  const g=G(),gn=`${g.icon||''} ${g.name||''}`.trim();
  $('title').textContent=tab==='onigiri'?`${gn} 発注`
    :tab==='profit'?`💰 利益・廃棄（${g.name||''}）`:`📷 カメラ取り込み（${g.name||''}）`;
  // どの画面もジャンルごとに中身が変わるため、ジャンル切替は常に出す
  const row=$('genRow');if(row)row.hidden=false;
  if(tab==='profit')renderProfit();
  window.scrollTo(0,0);
}
function renderTabs(){const el=$('tabs');el.textContent='';
  [['onigiri','📋','発注'],['profit','💰','利益・廃棄'],['camera','📷','カメラ取り込み']].forEach(([key,ic,name])=>{
    const b=document.createElement('button');b.className='tab';b.dataset.tab=key;
    b.onclick=()=>selectAppTab(key);
    const a=document.createElement('div');a.className='ic';a.textContent=ic;
    const c=document.createElement('div');c.className='nm';c.textContent=name;
    b.append(a,c);el.appendChild(b);
  });
  renderGenreTabs();
  selectAppTab(APP_TAB);
}
/* ジャンル切替。発注・利益廃棄・カメラ取り込みはジャンルごとの内容なので、
   どのジャンルを見ているかを常に画面に出す */
function renderGenreTabs(){
  const el=$('genTabs');if(!el)return;el.textContent='';
  GEN.forEach(([key,name,icon])=>{
    const g=DB.g[key];if(!g)return;
    const b=document.createElement('button');b.className='tab';b.dataset.gen=key;
    b.setAttribute('aria-selected',String(key===DB.active));
    b.onclick=()=>switchGenre(key);
    const a=document.createElement('div');a.className='ic';a.textContent=g.icon||icon;
    const c=document.createElement('div');c.className='nm';c.textContent=g.name||name;
    const d=document.createElement('div');d.className='ct';d.textContent=(g.items||[]).length+'品';
    b.append(a,c,d);el.appendChild(b);
  });
  // 選択中のジャンルが画面外にならないよう、行だけを横スクロールさせる
  const sel=el.querySelector('.tab[aria-selected=true]');
  if(sel)el.scrollLeft=Math.max(0,sel.offsetLeft-el.clientWidth/2+sel.offsetWidth/2);
}
function switchGenre(key){
  if(!DB||!DB.g[key]||key===DB.active)return;
  const dt=($('dt').value||'').trim(), wthr=($('wthr').value||'').trim();
  saveOrderDateDraft();          // 切り替え前のジャンルに、入力途中の発注を残す
  DB.active=key;ITEM_PAGE=0;
  if(SORT)toggleSort();          // 並べ替えモードは持ち越さない
  saveOrderDateDraft();          // 切替先ジャンルの入力も、そのジャンルの日付で残してから動かす
  const g=G();
  // 同じ納品日のまま次のジャンルを発注できるようにする（日付の入れ直し・取り違えを防ぐ）
  if(orderDateParts(dt)&&g.cur.dt!==dt)loadOrderDate(dt);
  if(!g.cur.wthr&&wthr)g.cur.wthr=wthr;   // 天気は同じ日ならジャンル共通
  renderAll();save();
  window.scrollTo(0,0);
}

function renderSetup(){
  const g=G(),i=dowInfo(),k=tgtKey(),t=k?g.tgt[k]:null,s=sums('o');
  const D=demand(); const dem=D?D.q:null, demSrc=D?D.src:'';
  const readiness=forecastReadiness(g);
  const aiAdp=getAiAdoption();
  if(t){if(!$('tq').value)$('tq').value=t.q;if(!$('ta').value)$('ta').value=t.a}
  const sp=specialPeriod($('dt').value);
  const rows=[
    ['納品日',$('dt').value.trim()||'未入力',$('dt').value.trim()?'':'warn'],
    ['曜日係数',i?`${i.d}曜 ${i.f.toFixed(2)}（${i.src}）`:'納品日を入れてください',i?'':'warn'],
    ['便構成比',i?`${i.type} ${i.r[0]}/${i.r[1]}/${i.r[2]}%`:'—',i?'ok':'warn'],
    ['提案の採用率',aiAdp?`${aiAdp.rate}% (${aiAdp.match}/${aiAdp.total}品) - ${aiAdp.label}`:'提案がまだありません',aiAdp?aiAdp.cls:'warn'],
    ['本部目標',t?`${t.q}個 / ${(t.a||0).toLocaleString()}円`:(k?k+'は未登録':'—'),t?'':'warn'],
    ['蓄積データ',readiness.ready
      ? `予測可能：販売実績${readiness.hist}日・週次${readiness.weeks}週・商品データ${readiness.withDay}/${readiness.items}品（${readiness.base.source}）`
      : `データ不足：販売実績${readiness.hist}日・週次${readiness.weeks}週・商品データ${readiness.withDay}/${readiness.items}品`,readiness.ready?'ok':'warn'],
    ['今日の需要見込み（提案数）',dem?`${dem}個（${demSrc}）`:'—',dem?'':'warn'],
    ['提案中',s.T?`${s.n}品 ${s.T}個 ${s.amt.toLocaleString()}円（${s.b.join('/')}）`:'まだ空です',s.T?'ok':'warn']
  ];
  if(sp)rows.splice(2,0,['特殊カレンダー',`${sp}期間：ストコンAIの学習対象外のため意思入れ必須`,'crit']);
  // 数日おきに発注するカテゴリ向け：期限内に売り切れる上限と、次回までに必要な数
  const cyc=Number(g.cycle)||0, shelf=Number(g.shelf)||0;
  if(cyc>1&&shelf>0&&dem){
    const need=Math.round(dem*cyc);          // 次回発注日まで持たせるのに必要な数
    const cap=Math.round(dem*shelf);          // 期限内に売り切れる上限
    const over=need-cap;
    rows.splice(rows.length-1,0,['期限と発注間隔',
      over>0
        ? `${cyc}日分=${need}個 必要だが期限${shelf}日で売り切れるのは${cap}個まで。${over}個は期限切れリスク（分けて発注を検討）`
        : `${cyc}日分=${need}個（期限${shelf}日で${cap}個まで売り切れる範囲内）`,
      over>0?'warn':'ok']);
    // 初日にどれだけ売れるかを見て、次回発注日まで在庫がもつか判定する
    const r1=(i&&i.r)?i.r[0]/100:0.59;        // 1便構成比＝初日に集中する割合の目安
    const day1=Math.round(dem*(1+r1));        // 初日に売れる想定（当日需要＋翌朝の立ち上がり分）
    if(s.T){
      const left=s.T-day1;
      const daysLeft=dem>0?(s.T/dem):0;
      rows.splice(rows.length-1,0,['在庫のもち',
        left<=0
          ? `発注${s.T}個は初日想定${day1}個で尽きる見込み。次回発注(${cyc}日後)まで欠品`
          : daysLeft<cyc
            ? `発注${s.T}個は約${daysLeft.toFixed(1)}日分。次回発注(${cyc}日後)まで${(cyc-daysLeft).toFixed(1)}日ぶん不足`
            : `発注${s.T}個は約${daysLeft.toFixed(1)}日分。次回発注(${cyc}日後)まで在庫はもつ見込み`,
        (left<=0||daysLeft<cyc)?'crit':'ok']);
    }
  }
  // 現在庫（ストコン中分類総数の繰越）。入っていれば発注判断の材料として出す
  const stk=(g.cur.carry==null||g.cur.carry==='')?null:Number(g.cur.carry);
  const pln=(g.cur.plan==null||g.cur.plan==='')?null:Number(g.cur.plan);
  if(stk!=null){
    const cb=carryBinText(g);
    rows.splice(rows.length-1,0,['現在庫',
      `${stk}個`+(pln!=null?` ＋ 納品予定${pln}個 ＝ ${stk+pln}個`:'')
      +(cb?`（${cb}）`:'')+(g.cur.stockSrc?`　出典：${g.cur.stockSrc}`:''),'']);
  }
  if(g.binNote)rows.splice(rows.length-1,0,['便構成',g.binNote,'']);
  // ストコンAIの配信版と、次の更新までの時間を表示
  const av=aiVersionNow(), selVer=$('aiver').value;
  const mismatch=selVer&&selVer!==av.cur;
  rows.splice(4,0,['ストコンAI配信版',
    `いま最新は${av.cur}（${av.note}）／次の更新 ${av.next}`
    +(mismatch?`　⚠ 入力済みは${selVer}のため${av.cur}と差がある可能性`:''),
    mismatch?'warn':'']);
  const aiT=['ai1','ai2','ai3'].reduce((a,id)=>a+(Number($(id).value)||0),0);
  if(aiT&&dem){
    const diff=Math.round((dem-aiT)/aiT*100);
    const close=Math.abs(diff)<=15;
    rows.splice(rows.length-1,0,['提案数とストコンAIの差',`提案${dem}個 / AI${aiT}個（${diff>0?'+':''}${diff}%）${close?'・近い':'・差が大きい'}`,close?'ok':'warn']);
  }
  const B=$('setup');B.textContent='';
  rows.forEach(([a,c,st])=>{const w=document.createElement('div');w.className='row';
    const x=document.createElement('div');x.className='k';x.textContent=a;
    const y=document.createElement('div');y.className='v '+(st||'');y.textContent=c;
    w.append(x,y);B.appendChild(w)});
  const m=$('setupmsg');
  if(!i){m.className='note warn';m.textContent='▲ 納品日を入れると曜日係数と便構成比が入ります'}
  else if(!s.T){m.className='note warn';m.textContent='▲ 目標を入れて「配分」を押してください'}
  else{m.className='note ok';m.textContent='✓ 準備できています'}
  renderMainMemos();
}

function renderItems(){
  const g=G();
  const desktop=window.matchMedia('(min-width:768px)').matches;
  const pageCount=desktop?Math.max(1,Math.ceil(g.items.length/ITEMS_PER_PAGE)):1;
  ITEM_PAGE=Math.min(ITEM_PAGE,pageCount-1);
  const pageStart=desktop?ITEM_PAGE*ITEMS_PER_PAGE:0;
  const pageItems=desktop?g.items.slice(pageStart,pageStart+ITEMS_PER_PAGE):g.items;
  const pager=$('itemPager');
  if(pager){
    pager.hidden=!desktop||g.items.length<=ITEMS_PER_PAGE;
    pager.textContent='';
    if(!pager.hidden){
      const label=document.createElement('span');label.textContent=`${pageStart+1}〜${Math.min(pageStart+ITEMS_PER_PAGE,g.items.length)}品 / ${g.items.length}品`;
      pager.append(label);
    }
  }
  const H=$('ith');H.textContent='';H.className=SORT?'sortmode':'';
  const hr=document.createElement('tr');
  const showOther=!SORT;
  const BINS=binsUsed(g);                       // マスタに登録のある便だけ表示する
  const bcols=BINS.map(i=>binLabel(g,i,true));
  const cols=SORT?['','商品',' ',...bcols,'計']:['商品','適',...bcols,'計',...(showOther?['他']:[])];
  cols.forEach((c,ix)=>{const th=document.createElement('th');th.textContent=c;
    if((SORT&&ix===1)||(!SORT&&ix===0))th.className='l';
    if(!SORT&&showOther&&ix===cols.length-1)th.className='col-other';
    hr.appendChild(th)});
  H.appendChild(hr);
  const B=$('itb');B.textContent='';
  if(!g.items.length){const tr=document.createElement('tr');const td=document.createElement('td');
    td.colSpan=7;td.className='l';td.style.padding='18px 6px';td.style.color='var(--muted)';
    td.textContent='まだ商品がありません。「＋商品」から登録するか、バックアップを読み込んでください。';
    tr.appendChild(td);B.appendChild(tr);return}
  pageItems.forEach((r,localIx)=>{
    const ix=pageStart+localIx;
    const tr=document.createElement('tr');
    if(SORT){
      const t0=document.createElement('td');const w=document.createElement('div');w.className='mv';
      const up=document.createElement('button');up.className='gh';up.textContent='↑ 上へ';up.title='この商品を1つ上へ移動';
      up.disabled=ix===0;up.onclick=()=>mv(ix,-1);
      const dn=document.createElement('button');dn.className='gh';dn.textContent='↓ 下へ';dn.title='この商品を1つ下へ移動';
      dn.disabled=ix===g.items.length-1;dn.onclick=()=>mv(ix,1);
      w.append(up,dn);t0.appendChild(w);tr.appendChild(t0)}
    const t1=document.createElement('td');t1.className='l nmcell';
    const n1=document.createElement('div');n1.className='nm1';
    if(r.tag){
      const isNew=r.tag.includes('新');
      const sp=document.createElement('span');
      sp.className='pill '+(isNew?'pill-warn':'');
      sp.textContent=r.tag+(isNew?' ⚠':'');
      if(isNew)sp.title='新商品2週目は注意（施策終了後は推奨が多く出やすい）';
      n1.appendChild(sp)}
    const nameSp=document.createElement('span');nameSp.className='nm1-name';nameSp.textContent=r.name;
    n1.appendChild(nameSp);
    const wf=wasteFactor(r);
    const infoParts=['¥'+(r.price||0)+' 日販'+(r.day||0)+((r.unit||1)>1?' 2個単位':'')];
    if(itemDClass(r)!=null)infoParts.push('廃棄D'+itemDClass(r));
    if(r.memo)infoParts.push(r.memo);
    if(r.my)infoParts.push('本部目安'+r.my+'個');
    if(wf<1)infoParts.push(`廃棄実績${Math.round((1-wf)*100)}%減`);
    // 蓄積した週次データが2週分以上あれば、前週との増減を表示
    const trend=itemTrend(g,r.name);
    if(trend.length>=2){
      const a=trend[trend.length-1].sales,b=trend[trend.length-2].sales;
      if(b>0){const d=Math.round((a-b)/b*100);
        if(Math.abs(d)>=10)infoParts.push(`前週比${d>0?'+':''}${d}%(${b}→${a})`)}
    }
    const n2=document.createElement('div');n2.className='nm2'+(wf<1?' nm2-warn':'');
    n2.textContent=infoParts.join(' ・ ');
    t1.append(n1,n2);
    t1.onclick=()=>{if(SORT)editItem(ix)};
    tr.appendChild(t1);
    const t2=document.createElement('td');
    if(SORT){const b=document.createElement('button');b.className='gh sm';b.textContent='編集';
      b.onclick=()=>editItem(ix);t2.appendChild(b)}
    else{const sp=document.createElement('span');
      sp.className='gr '+({'◎':'g4c','○':'g3c','△':'g2c','×':'g1c','新':'gnc'}[r.grade]||'g2c');
      sp.textContent=r.grade||'—';t2.appendChild(sp)}
    tr.appendChild(t2);
    const v=vv(r.id,MODE);
    const t6=document.createElement('td');t6.className='tot';
    BINS.forEach((i,ci)=>{const td=document.createElement('td');
      const allowed=itemBins(r,g).includes(i);if(!allowed)td.className='bin-off';
      const inp=document.createElement('input');inp.type='number';inp.inputMode='numeric';
      inp.dataset.row=ix;inp.dataset.col=ci;
      inp.value=!allowed?'':(v[i]===null?'':v[i]);
      if(!allowed){inp.disabled=true;inp.title='この商品は対象外の便です'}
      if((r.unit||1)>1&&v[i]!=null&&v[i]%r.unit!==0){
        inp.classList.add('bad-unit');inp.title=`${r.unit}個単位です`}
      inp.onfocus=e=>e.target.select();
      inp.onkeydown=e=>{
        const rIx=+e.target.dataset.row, cIx=+e.target.dataset.col;
        const last=BINS.length-1;
        if(e.key==='Enter'||e.key==='ArrowDown'){
          e.preventDefault();
          let nxt=cIx<last?document.querySelector(`input[data-row="${rIx}"][data-col="${cIx+1}"]`)
                          :document.querySelector(`input[data-row="${rIx+1}"][data-col="0"]`);
          if(nxt)nxt.focus();
        }else if(e.key==='ArrowUp'){
          e.preventDefault();
          let prev=cIx>0?document.querySelector(`input[data-row="${rIx}"][data-col="${cIx-1}"]`)
                        :document.querySelector(`input[data-row="${rIx-1}"][data-col="${last}"]`);
          if(prev)prev.focus();
        }
      };
      // 表全体を作り直すとフォーカスが外れモバイルのキーボードが閉じてしまうため、
      // 変更のあった行の合計と合計行だけを更新する
      inp.oninput=e=>{const x=e.target.value===''?null:Number(e.target.value);
        setV(r.id,MODE,i,x);
        const badUnit=(r.unit||1)>1&&x!=null&&x%r.unit!==0;
        inp.classList.toggle('bad-unit',badUnit);
        inp.title=badUnit?`${r.unit}個単位です`:'';
        const nv=vv(r.id,MODE);
        t6.textContent=nv.reduce((a,c)=>a+(c||0),0)||'';
        refreshSum();renderSetup();autosave()};
      // 狭い画面では見出し行を隠すため、各入力の上に便名を出す
      const bl=document.createElement('span');bl.className='bl';bl.textContent=binLabel(g,i,false,r);
      td.append(bl,inp);tr.appendChild(td)});
    t6.textContent=v.reduce((a,c)=>a+(c||0),0)||'';tr.appendChild(t6);
    if(showOther){const t7=document.createElement('td');t7.className='col-other';t7.style.fontSize='11px';t7.style.color='var(--muted)';
      const oth=MODE==='o'?['i']:['o'];
      t7.textContent=oth.map(m=>{const x=vv(r.id,m).reduce((a,c)=>a+(c||0),0);return x||'-'}).join('/');
      tr.appendChild(t7)}
    B.appendChild(tr)});
  B.className='bins'+BINS.length+(SORT?' sortmode':'');
  addSum(BINS)}
function gotoItemPage(page){
  const count=Math.max(1,Math.ceil(G().items.length/ITEMS_PER_PAGE));
  ITEM_PAGE=Math.max(0,Math.min(page,count-1));
  renderItems();
}
function itemNavBy(dir){
  if(window.matchMedia('(min-width:768px)').matches&&G().items.length>ITEMS_PER_PAGE){
    gotoItemPage(ITEM_PAGE+dir);
  }else{
    hscrollBy('itwrap',dir);
  }
}
function refreshSum(){
  const old=$('itb').querySelector('tr.sum');
  if(old)old.remove();
  addSum(binsUsed());}
function addSum(BINS){const s=sums(MODE),tr=document.createElement('tr');tr.className='sum';
  BINS=BINS||[0,1,2];
  const c=(t,cl)=>{const td=document.createElement('td');td.textContent=t;if(cl)td.className=cl;tr.appendChild(td)};
  const showOther=!SORT;
  if(SORT)c('');c('合計 '+s.n+'品','l');c('');
  BINS.forEach(i=>c(s.b[i]));c(s.T);
  if(showOther)c(s.amt.toLocaleString(),'col-other');
  $('itb').appendChild(tr)}
function paintTotals(){renderItems();renderSetup()}
function mv(i,d){const a=G().items;const j=i+d;if(j<0||j>=a.length)return;
  [a[i],a[j]]=[a[j],a[i]];renderItems();autosave()}
function toggleSort(){SORT=!SORT;$('sortb').textContent=SORT?'並べ替え：ON（上下ボタン）':'並べ替え：OFF';
  $('sortb').setAttribute('aria-pressed',String(SORT));renderItems()}
function setMode(m){MODE=m;['o','i'].forEach(k=>$('m_'+k).setAttribute('aria-pressed',String(k===m)));renderItems()}
function fillFrom(src){G().items.forEach(r=>{const v=vv(r.id,src);
  if(v.some(x=>x!==null))v.forEach((x,i)=>setV(r.id,MODE,i,x))});paintTotals();autosave();flash('コピーしました')}
function clearMode(){G().items.forEach(r=>{const c=G().cur.v[r.id];if(c)c[MODE]=[null,null,null]});
  paintTotals();autosave()}

function renderHist(){const B=$('htb');B.textContent='';
  G().hist.forEach((h,i)=>{const tr=document.createElement('tr');
    const c=(t,cl)=>{const td=document.createElement('td');td.textContent=t;if(cl)td.className=cl;tr.appendChild(td);return td};
    c(h.d,'l');c(h.ai??'—');c(h.n??'—');c(h.s??'—');c(h.ha??'—');
    c(h.n&&h.s?(h.s/h.n*100).toFixed(1)+'%':'—');
    c(h.nb?h.nb.map(x=>x??'-').join('/'):'—');
    const x=c('');const b=document.createElement('button');b.className='gh sm';b.textContent='×';
    b.onclick=()=>{G().hist.splice(i,1);renderHist();autosave()};x.appendChild(b);
    B.appendChild(tr)})}
function openHistoryList(){renderHist();$('dHistList').showModal()}

function renderAll(){renderTabs();
  const g=G();$('dt').value=g.cur.dt||'';
  $('wthr').value=g.cur.wthr||'';
  const ai=g.cur.ai||[null,null,null];
  $('ai1').value=ai[0]??'';$('ai2').value=ai[1]??'';$('ai3').value=ai[2]??'';
  $('stk').value=g.cur.carry??'';$('stkp').value=g.cur.plan??'';
  $('stkb').value=carryBinText(g);
  // 未選択なら今の時刻から最新の配信版を初期表示する（表示と選択のズレを防ぐ）
  $('aiver').value=g.cur.aiVer||aiVersionNow().cur;
  applyDow();renderItems();renderHist();renderSetup();renderWeekly();
  if(APP_TAB==='profit')renderProfit()}

/* ---------- 廃棄実績×値入率による発注数の利益ベース補正 ---------- */
function wasteFactor(r){
  if(!r.pos||r.margin==null)return 1;
  const sales=(r.pos.sales||[]).reduce((a,x)=>a+(x||0),0);
  const waste=(r.pos.waste||[]).reduce((a,x)=>a+(x||0),0);
  if(waste<=0||sales+waste<=0)return 1;
  const wasteRatio=waste/(sales+waste);
  const costRatio=1-r.margin/100, profitRatio=r.margin/100;
  if(profitRatio<=0)return 1;
  const reduce=Math.min(0.3,wasteRatio*(costRatio/profitRatio));
  return 1-reduce;
}
function edayOf(r){return (r.day||0)*wasteFactor(r)}

/* ---------- 利益・廃棄バランス（表示のみ。発注数は書き換えない） ----------
   粗利予想     = 予想販売数 × 売価 × 値入率
   廃棄ロス予想 = 予想廃棄数 × 売価 × (1-値入率)   ※廃棄は原価ロスとして数える
   予想廃棄数   = 「需要見込みを超えた分」と「実績廃棄率×発注数」の大きい方
   使う数字は既存データ（売価・値入率・日販・品揃え画面の週販売/週廃棄）だけから拾い、
   足りない商品は推測せず「データ不足」として分けて表示する。 */
let PF_ALL=false;
const pfYen=v=>Math.round(v).toLocaleString();
const pfQty=v=>(Math.round(v*10)/10).toString();

/* 商品が店に並べる日数。商品のshelf → 廃棄区分D → ジャンルのshelf の順で見る。
   D区分は「納品のD日後に廃棄」なので、D3なら3日ぶんとして短めに数える（D0は当日で1日） */
function itemShelfDays(r,g){
  g=g||G();
  const rs=Number(r&&r.shelf);
  if(rs>0)return{d:rs,src:`消費期限${rs}日`};
  const d=Number(r&&r.dclass);
  if(Number.isInteger(d)&&d>=0&&d<=6)return{d:Math.max(1,d),src:`D${d}`};
  const gs=Number(g.shelf);
  if(gs>0)return{d:gs,src:`ジャンルの消費期限${gs}日`};
  return{d:1,src:'期限未設定のため1日'};
}
/* 1日あたりの需要のもと。日販を優先し、無ければ品揃え画面の週販売から日割りする */
function pfDemandBase(r){
  if((r.day||0)>0)return{d:Number(r.day),src:'日販'+r.day+'個'};
  if(r.rank&&r.rank.s!=null&&r.rank.days>0)
    return{d:r.rank.s/r.rank.days,src:`売上ランキング${r.rank.s}個÷${r.rank.days}日`};
  const ws=(r.pos&&r.pos.sales)||[];
  for(let i=ws.length-1;i>=0;i--){
    if(ws[i]!=null&&ws[i]>0)return{d:ws[i]/7,src:'週販売'+ws[i]+'個÷7日'};
  }
  return null;
}
/* 発注日に効く係数。曜日・天気は既存の発注画面と同じものを使う */
function pfFactors(){
  const g=G(),i=dowInfo();
  return{i,f:i?i.f:1,wf:weatherFactor($('wthr').value,i?i.r:null),
    cyc:Math.max(1,Number(g.cycle)||1)};
}
/* 実績の廃棄率＝週廃棄÷(週販売+週廃棄)。品揃え画面の4週分から拾う */
function pfWasteRate(r){
  const s=((r.pos&&r.pos.sales)||[]).reduce((a,x)=>a+(x||0),0);
  const w=((r.pos&&r.pos.waste)||[]).reduce((a,x)=>a+(x||0),0);
  if(s+w>0)return{rate:w/(s+w),sales:s,waste:w,src:'品揃え4週'};
  if(r.rank&&(r.rank.s!=null||r.rank.w!=null)){
    const rs=r.rank.s||0, rw=r.rank.w||0;
    if(rs+rw>0)return{rate:rw/(rs+rw),sales:rs,waste:rw,src:`売上ランキング${r.rank.days}日分`};
  }
  return null;
}
/* いま入っている発注数。「実際の発注」が入っていればそれを、無ければ「提案」を見る */
function pfOrderQty(r){
  const vi=vv(r.id,'i'),vo=vv(r.id,'o');
  const use=vi.some(x=>x!=null)?{v:vi,m:'実際の発注'}:{v:vo,m:'提案'};
  const bins=itemBins(r,G());
  return{q:use.v.reduce((a,x,ix)=>a+(bins.includes(ix)?(x||0):0),0),mode:use.m};
}
/* ストコンの値入率は税込売価ベース（例：売価298円・原価186.07円で値入率37.5%）。
   アプリは売価を税抜で持つため、金額計算では税込に戻してから原価を出す */
const TAX_RATE=1.08;
/* 税込売価。写真から読んだ税込売価があり、いまの税抜売価と食い違っていなければそれを使う
   （税抜に丸めてから戻すと数円ずれるため）。売価を手で直した場合は自動で使われなくなる */
function pfPriceIn(r){
  const ex=Number(r.price)||0, inc=Number(r&&r.priceIn);
  if(inc>0&&Math.round(inc/TAX_RATE)===ex)return inc;
  return ex*TAX_RATE;
}
/* 1個あたりの原価。原価が登録されていればそれを使い、無ければ税込売価×(1-値入率) */
function pfCost(r,m){
  const c=Number(r&&r.cost);
  if(c>0)return{c,src:'原価'};
  return{c:pfPriceIn(r)*(1-m/100),src:'値入率から計算'};
}
/* 発注q個のときの粗利・廃棄ロス・差引。粗利＝税込売価−原価、廃棄ロス＝原価 */
function pfMoney(q,D,w,priceIn,cost){
  const waste=Math.min(q,Math.max(Math.max(0,q-D),w==null?0:q*w));
  const sold=q-waste;
  const profit=sold*(priceIn-cost),loss=waste*cost;
  return{q,sold,waste,profit,loss,net:profit-loss};
}
/* 値入率。商品ごとの値入率が無ければジャンル既定を使い、どちらを使ったか返す */
function pfMargin(r,g){
  if(r.margin!=null&&r.margin!=='')return{m:Number(r.margin),src:''};
  const gm=(g||G()).margin;
  if(gm!=null&&gm!=='')return{m:Number(gm),src:'ジャンル既定'};
  return{m:null,src:''};
}
function pfCalc(r){
  const price=Number(r.price)||0,mg=pfMargin(r,G()),m=mg.m;
  const o=pfOrderQty(r),dem=pfDemandBase(r),wr=pfWasteRate(r),F=pfFactors();
  const miss=[];
  if(!price)miss.push('売価');
  if(m==null)miss.push('値入率');
  if(!dem)miss.push('日販/週販売');
  if(miss.length)return{r,q:o.q,mode:o.mode,miss};
  // その発注が売り切れるまでに使える日数。期限が長い商品は当日で廃棄にはならない
  const sh=itemShelfDays(r,G());
  const win=Math.max(1,sh.d,F.cyc);
  const D=dem.d*F.f*F.wf*win;
  const priceIn=pfPriceIn(r), cs=pfCost(r,m);
  const now=pfMoney(o.q,D,wr?wr.rate:null,priceIn,cs.c);
  const unit=Math.max(1,Number(r.unit)||1);
  const floor=Math.max(0,Number(r.my)||0);   // 本部目安より下は候補にしない
  let best=now;
  for(let x=o.q-unit;x>=floor;x-=unit){
    const c=pfMoney(x,D,wr?wr.rate:null,priceIn,cs.c);
    if(c.net>best.net+1)best=c;              // 1円未満の差では動かさない
  }
  return{r,q:o.q,mode:o.mode,price,priceIn,cost:cs.c,costSrc:cs.src,m,mSrc:mg.src,D,dem,wr,unit,floor,now,sh,win,
    cut:best.q<o.q?{q:best.q,net:best.net,gain:best.net-now.net}:null};
}

function toggleProfitAll(){PF_ALL=!PF_ALL;renderProfit()}

function renderProfit(){
  if(!$('pfSum'))return;
  const g=G(),F=pfFactors();
  const all=g.items.map(pfCalc);
  const ok=all.filter(x=>!x.miss&&x.q>0);
  const miss=all.filter(x=>x.miss&&x.q>0);
  const none=all.filter(x=>!x.miss&&x.q===0).length;

  /* --- 使った数字の出典 --- */
  const modeCnt=ok.reduce((a,x)=>{a[x.mode]=(a[x.mode]||0)+1;return a},{});
  const modeTxt=Object.keys(modeCnt).length
    ? Object.entries(modeCnt).map(([k,v])=>`${k} ${v}品`).join(' / ')
    : '発注数が入っていません';
  const head=[
    ['ジャンル',`${g.icon||''} ${g.name||''}（${g.items.length}品）`,''],
    ['納品日',($('dt').value||'').trim()||'未入力',($('dt').value||'').trim()?'':'warn'],
    ['発注数の出典',modeTxt,ok.length?'':'warn'],
    ['曜日係数',F.i?`${F.i.d}曜 ${F.f.toFixed(2)}（${F.i.src}）`:'納品日が未入力のため1.00で計算','' ],
    ['天気係数',`${F.wf.toFixed(2)}（${($('wthr').value||'').trim()||'天気未入力'}）`,''],
    ['発注サイクル',F.cyc>1?`${F.cyc}日分をこの発注でまかなう前提`:'1日分（毎日発注）','']
  ];
  const H=$('pfHead');H.textContent='';
  head.forEach(([k,v,st])=>{
    const w=document.createElement('div');w.className='row';
    const a=document.createElement('div');a.className='k';a.textContent=k;
    const b=document.createElement('div');b.className='v '+(st||'');b.textContent=v;
    w.append(a,b);H.appendChild(w)});

  /* --- ジャンル合計 --- */
  const T=ok.reduce((a,x)=>{a.q+=x.q;a.sold+=x.now.sold;a.waste+=x.now.waste;
    a.profit+=x.now.profit;a.loss+=x.now.loss;a.net+=x.now.net;
    if(x.cut){a.gain+=x.cut.gain;a.cutQ+=x.q-x.cut.q;a.cutN++}
    return a},{q:0,sold:0,waste:0,profit:0,loss:0,net:0,gain:0,cutQ:0,cutN:0});
  const wRate=T.q>0?T.waste/T.q*100:0;
  const sum=[
    ['発注合計',ok.length?`${T.q}個（${ok.length}品）`:'—',ok.length?'':'warn'],
    ['予想販売数',ok.length?`${pfQty(T.sold)}個`:'—',''],
    ['予想廃棄数',ok.length?`${pfQty(T.waste)}個（発注の${wRate.toFixed(1)}%）`:'—',wRate>=10?'warn':''],
    ['粗利予想',ok.length?`${pfYen(T.profit)}円`:'—',''],
    ['廃棄ロス予想',ok.length?`${pfYen(T.loss)}円`:'—',T.loss>T.profit?'crit':''],
    ['差引',ok.length?`${T.net>=0?'+':''}${pfYen(T.net)}円`:'—',T.net<0?'crit':'ok']
  ];
  // 現在庫を入れた見通し。在庫が積み上がっていると、発注を抑えても余る場合がある
  const stk=(g.cur.carry==null||g.cur.carry==='')?null:Number(g.cur.carry);
  const pln=(g.cur.plan==null||g.cur.plan==='')?null:Number(g.cur.plan);
  let overStock=null;
  if(stk!=null){
    const demandTotal=ok.reduce((a,x)=>a+x.D,0);          // 各商品の期限日数ぶんの需要見込み合計
    const have=stk+(pln!=null?pln:0)+T.q;
    const over=have-demandTotal;
    // 余りを金額にするための1個あたり原価（発注した商品の加重平均）
    const costPer=T.q>0?ok.reduce((a,x)=>a+x.cost*x.q,0)/T.q:0;
    sum.push(['在庫込みの見通し',
      `現在庫${stk}個`+(pln!=null?` ＋ 納品予定${pln}個`:'')+` ＋ 発注${T.q}個 ＝ ${pfQty(have)}個`
      +`／期限内に売れる見込み ${pfQty(demandTotal)}個`+(g.cur.stockSrc?`（在庫の出典：${g.cur.stockSrc}）`:''),'']);
    const si=Number(g.cur.stockItems)||0;
    if(si&&si>g.items.length){
      sum.push(['在庫の対象範囲',
        `ストコンでは${si}品ありますが、アプリに登録されているのは${g.items.length}品です。`
        +'在庫込みの見通しは、登録した商品ぶんの需要としか比べていないため参考値です','warn']);
    }
    if(ok.length){
      overStock={over,costPer,partial:si&&si>g.items.length};
      sum.push(['余る見込み',
        over>0
          ? `${pfQty(over)}個（原価換算 約${pfYen(over*costPer)}円）。発注を${Math.min(T.q,Math.ceil(over))}個抑えると余りが解消する計算`
          : `余りは出ない見込み（${pfQty(-over)}個ぶん余裕）`,
        over>0?'crit':'ok']);
    }
  }
  if(T.cutN)sum.push(['抑えた場合',
    `${T.cutN}品で計${T.cutQ}個減らすと 差引 ${T.net+T.gain>=0?'+':''}${pfYen(T.net+T.gain)}円（${pfYen(T.gain)}円 改善）`,'warn']);
  // ストコンの実績金額があれば比較材料として並べる（出典を明示、計算には使わない）
  const wa=g.weekHist&&g.weekHist.amount&&g.weekHist.amount.cur&&g.weekHist.amount.cur.weekAvg;
  if(wa&&(wa.profit!=null||wa.wasteCost!=null))sum.push(['実績の週平均（参考）',
    `粗利${wa.profit!=null?pfYen(wa.profit):'—'}円 / 廃棄原価${wa.wasteCost!=null?pfYen(wa.wasteCost):'—'}円`
    +(g.weekHist.range?`（${g.weekHist.range} ストコン日別推移）`:''),'']);
  const S=$('pfSum');S.textContent='';
  sum.forEach(([k,v,st])=>{
    const w=document.createElement('div');w.className='row';
    const a=document.createElement('div');a.className='k';a.textContent=k;
    const b=document.createElement('div');b.className='v '+(st||'');b.textContent=v;
    w.append(a,b);S.appendChild(w)});

  const J=$('pfJudge');
  if(!g.items.length){J.className='note warn';
    J.textContent=`${g.name}にはまだ商品が登録されていません。「カメラ取り込み」で品揃え画面の写真から登録するか、発注画面の「＋商品」で登録してください。`}
  else if(!ok.length){J.className='note warn';J.textContent='計算できる商品がありません。発注数を入れるか、売価・値入率・日販を登録してください。'}
  else if(T.net<0){J.className='note crit';
    J.textContent=`廃棄ロス予想（${pfYen(T.loss)}円）が粗利予想（${pfYen(T.profit)}円）を上回っています。下の候補で発注を抑えることを検討してください。`}
  else if(overStock&&overStock.over>0){J.className=overStock.partial?'note warn':'note crit';
    J.textContent=overStock.partial
      ? `登録済みの商品だけで見ると${pfQty(overStock.over)}個余る計算ですが、ストコンの品数より登録が少ないため参考値です。まず商品を登録してください。`
      : `現在庫を入れると${pfQty(overStock.over)}個（原価 約${pfYen(overStock.over*overStock.costPer)}円）余る見込みです。`
        +`在庫が残っているので、発注を${Math.min(T.q,Math.ceil(overStock.over))}個ぶん抑えることを検討してください。`}
  else if(T.gain>0){J.className='note warn';
    J.textContent=`全体では差引プラスですが、${T.cutN}品を抑えると差引が${pfYen(T.gain)}円改善する計算です。`}
  else{J.className='note ok';J.textContent='いまの発注数では、粗利予想が廃棄ロス予想を上回っています。'
      +(stk!=null?'現在庫を入れても余りは出ない見込みです。':'')+'抑える候補はありません。'}

  /* --- 商品ごとの一覧 --- */
  const cand=ok.filter(x=>x.cut||x.now.net<0);
  const list=(PF_ALL?ok:cand).slice().sort((a,b)=>
    (b.cut?b.cut.gain:0)-(a.cut?a.cut.gain:0)||a.now.net-b.now.net);
  $('pfListTitle').textContent=PF_ALL?`全品（${ok.length}品）`:`抑える候補（${cand.length}品）`;
  const btn=$('pfAllBtn');
  if(btn){btn.setAttribute('aria-pressed',String(PF_ALL));btn.textContent=PF_ALL?'候補だけ表示':'全品を表示'}
  const TH=$('pfTh');TH.textContent='';
  const hr=document.createElement('tr');
  ['商品','発注','抑え目安','改善','差引','予想販売','予想廃棄','粗利予想','廃棄ロス'].forEach((c,ix)=>{
    const th=document.createElement('th');th.textContent=c;if(ix===0)th.className='l';hr.appendChild(th)});
  TH.appendChild(hr);
  const B=$('pfTb');B.textContent='';
  if(!list.length){
    const tr=document.createElement('tr'),td=document.createElement('td');
    td.colSpan=9;td.className='l';td.style.padding='16px 6px';td.style.color='var(--muted)';
    td.textContent=ok.length?'抑える候補はありません。':'表示できる商品がありません。';
    tr.appendChild(td);B.appendChild(tr);
  }
  list.forEach(x=>{
    const tr=document.createElement('tr');
    const c=(t,cl)=>{const td=document.createElement('td');td.textContent=t;if(cl)td.className=cl;tr.appendChild(td);return td};
    const nm=c('','l nmcell');
    const n1=document.createElement('div');n1.className='nm1';
    const n1n=document.createElement('div');n1n.className='nm1-name';n1n.textContent=x.r.name;n1.appendChild(n1n);
    const n2=document.createElement('div');n2.className='nm2';
    n2.textContent=`${x.mode} / 売価${Math.round(x.priceIn)}円(税込) 原価${Math.round(x.cost)}円`
      +`${x.costSrc==='原価'?'':'(値入'+x.m+'%'+(x.mSrc?'・'+x.mSrc:'')+'から)'} / ${x.sh.src}`
      +(x.win>1?`＝${x.win}日ぶんで計算`:'')
      +(x.wr?` / 実績廃棄率${(x.wr.rate*100).toFixed(1)}%（${x.wr.src}）`:' / 実績廃棄データなし');
    if(x.wr&&x.wr.rate*100>=x.m)n2.className='nm2 nm2-warn';
    nm.append(n1,n2);
    // 見たい順：いまの発注 → 抑え目安 → 改善額 → 差引 → 内訳
    c(x.q);
    c(x.cut?`${x.cut.q}個`:'—',x.cut?'warn':'');
    c(x.cut?`+${pfYen(x.cut.gain)}円`:'—',x.cut?'warn':'');
    c((x.now.net>=0?'+':'')+pfYen(x.now.net),x.now.net<0?'crit':'');
    c(pfQty(x.now.sold));c(pfQty(x.now.waste));
    c(pfYen(x.now.profit));c(pfYen(x.now.loss));
    B.appendChild(tr);
  });
  const msg=$('pfMsg');
  const notes=[];
  const noShelf=ok.filter(x=>x.sh.src==='期限未設定のため1日').length;
  if(noShelf)notes.push(`期限（廃棄区分D）が未設定の商品${noShelf}品は1日で計算しています。品揃えマスターの「廃棄D」を入れると精度が上がります。`);
  if(none)notes.push(`発注数が0の商品${none}品は計算対象外です。`);
  notes.push('「抑え目安」は本部目安と発注単位を下回らない範囲で、差引がいちばん大きくなる数です。この画面では発注数を書き換えません。');
  msg.textContent=notes.join(' ');

  /* --- 根拠（入力→出典→式→結果→未確認） --- */
  const sample=list[0]||ok[0];
  const why=[
    ['使った入力値','売価・値入率・日販（商品設定）／週販売・週廃棄（品揃えマスター取込）／発注数（この画面の発注入力）',''],
    ['需要見込みの式','需要見込み ＝ 日販 × 曜日係数 × 天気係数 × 売り切るまでに使える日数（期限日数と発注サイクルの長い方）',''],
    ['期限の見方','商品の消費期限 → 廃棄区分D（D3なら3日ぶん、D0は1日） → ジャンルの消費期限 の順で見る。どれも無ければ1日',''],
    ['予想廃棄の式','予想廃棄数 ＝ 「発注数 − 需要見込み（期限内に売り切れない分）」と「発注数 × 実績廃棄率」の大きい方',''],
    ['金額の式','粗利 ＝ 予想販売数 ×（税込売価 − 原価） ／ 廃棄ロス ＝ 予想廃棄数 × 原価',''],
    ['原価の出し方','商品に原価が登録されていればその値。無ければ 税込売価 ×（1 − 値入率）で計算します'
      +'（ストコンの値入率は税込売価ベース。例：売価298円・値入率37.5%なら原価186円）',''],
    ['1個あたりの分岐点','実績廃棄率が値入率(%)を超えている商品は、1個増やすほど廃棄ロスが粗利を上回る計算になります','']
  ];
  if(sample)why.push(['計算例',
    `${sample.r.name}：発注${sample.q}個・需要見込み${pfQty(sample.D)}個`
    +`（${sample.dem.src}×${F.f.toFixed(2)}×${F.wf.toFixed(2)}${sample.win>1?'×'+sample.win+'日（'+sample.sh.src+'）':''}）`
    +`／税込売価${Math.round(sample.priceIn)}円・原価${Math.round(sample.cost)}円`
    +` → 販売${pfQty(sample.now.sold)}個・廃棄${pfQty(sample.now.waste)}個`
    +` → 粗利${pfYen(sample.now.profit)}円 − 廃棄ロス${pfYen(sample.now.loss)}円 ＝ ${sample.now.net>=0?'+':''}${pfYen(sample.now.net)}円`,'']);
  why.push(['在庫の扱い',
    stk!=null
      ? '現在庫と納品予定は「在庫込みの見通し」だけで使っています。商品ごとの粗利・廃棄ロスは発注数だけで計算しているため、在庫のぶんは商品ごとの数字には入っていません。'
      : '現在庫が未入力です。「中分類総数」の写真を取り込むか、発注画面の現在庫欄に入れると、在庫を含めた余り見込みが出せます。',
    stk!=null?'':'warn']);
  why.push(['未確認・注意',
    '需要見込みは日販と係数からの推測です。実際の売れ方（時間帯・便別の在庫切れ・機会ロス）は含みません。'
    +'在庫がどの商品に何個あるかは分からないため、余りはジャンル合計でしか出せません。'
    +'廃棄ロスは原価ロスとして数えています。欠品による売り逃しは金額に入っていないため、抑え目安どおりに減らすと欠品する場合があります。','warn']);
  const W=$('pfWhy');W.textContent='';
  why.forEach(([k,v,st])=>{
    const w=document.createElement('div');w.className='row';w.style.gridColumn='1/-1';
    const a=document.createElement('div');a.className='k';a.style.flex='0 0 120px';a.textContent=k;
    const b=document.createElement('div');b.className='v '+(st||'');b.textContent=v;
    w.append(a,b);W.appendChild(w)});
  const M=$('pfMiss');
  const needMargin=miss.some(x=>x.miss.includes('値入率'));
  M.textContent=miss.length
    ? 'データ不足で計算できない商品：'+miss.map(x=>`${x.r.name}（${x.miss.join('・')}が未登録）`).join(' / ')
      +(needMargin?'　※値入率は設定の「ジャンル既定の値入率」でまとめて補えます':'')
    : '';
  M.className=miss.length?'note warn':'note';
}

/* ---------- 公式マニュアル準拠：売筋上位50%傾斜配分 ---------- */
function fix2(v,unit){if((unit||1)<2)return v.slice();v=v.slice();const T=v.reduce((a,b)=>a+b,0);
  if(!v.includes(1))return v;if(T<=1)return[0,0,0];
  const o=[0,1,2].sort((a,b)=>v[b]-v[a]||a-b),k=Math.min(3,Math.floor(T/2)),use=o.slice(0,k);
  const w=use.map(i=>Math.max(v[i],.5)),W=w.reduce((a,b)=>a+b,0),out=[0,0,0];let rem=T;
  use.forEach((i,ix)=>{let q;if(ix===use.length-1)q=rem;
    else{q=Math.max(2,Math.round(T*w[ix]/W));q=Math.min(q,rem-2*(use.length-ix-1))}out[i]=q;rem-=q});
  return out}

function alloc(){
  const g=G();if(!g.items.length){alert('先に商品を登録してください');return}
  applyDow();
  let tq=Number($('tq').value)||0;const ta=Number($('ta').value)||0;
  // 「実際の発注」に便別の個数が入っている商品はその数をそのまま使い、
  // 入力がない商品だけを目標総数から配分する
  const hasDetail=r=>vv(r.id,'i').some(x=>x!=null);
  const detailed=g.items.filter(r=>(r.day||0)>0&&hasDetail(r));
  const detailedTotal=detailed.reduce((a,r)=>a+vv(r.id,'i').reduce((x,y)=>x+(y||0),0),0);
  const detailedBin=[0,1,2].map(i=>detailed.reduce((a,r)=>a+(vv(r.id,'i')[i]||0),0));
  const live=g.items.filter(r=>(r.day||0)>0&&!hasDetail(r));
  if(!live.length&&!detailed.length){alert('日販が入っている商品がありません');return}
  let usedDemand=false;
  if(!tq&&!ta){
    const D=demand();
    if(!D){alert('目標個数か金額を入れてください（天気・曜日から提案するには設定で週平均販売数を登録してください）');return}
    if(!confirm(`目標が未入力です。天気・曜日からの提案数(${D.q}個)を使って全商品の発注数を配分しますか？`))return;
    tq=D.q;usedDemand=true;
  }
  const priceBase=g.items.filter(r=>(r.day||0)>0);
  let target=tq||Math.round(ta/(priceBase.reduce((a,r)=>a+r.price*r.day,0)/priceBase.reduce((a,r)=>a+r.day,0)));
  target=Math.max(0,target-detailedTotal);          // 便別入力済みの分は目標から差し引く

  const q={};let T=0,p1=0,p2=0,p3=0,R=[0,0,0];
  if(live.length){
    const sorted=[...live].sort((a,b)=>edayOf(b)-edayOf(a));
    const topCount=Math.max(1,Math.ceil(sorted.length*0.5));
    const topIds=new Set(sorted.slice(0,topCount).map(r=>r.id));

    const base={};
    const W_top=sorted.slice(0,topCount).reduce((a,r)=>a+edayOf(r),0);
    const minBotTotal=sorted.slice(topCount).reduce((a,r)=>a+Math.round(edayOf(r)),0);
    const allocTop=Math.max(0,target-minBotTotal);

    live.forEach(r=>{
      if(topIds.has(r.id)){
        base[r.id]=W_top>0?(edayOf(r)/W_top*allocTop):edayOf(r);
      }else{
        base[r.id]=Math.max(1,Math.round(edayOf(r)));
      }
      q[r.id]=Math.max(r.my||1,Math.round(base[r.id]));
    });

    const S=()=>live.reduce((a,r)=>a+q[r.id],0);
    let gd=0;
    while(S()>target&&gd++<900){
      const k=live.filter(r=>q[r.id]>Math.max(r.my||1,1))
        .sort((a,b)=>(q[b.id]-base[b.id])-(q[a.id]-base[a.id]))[0];if(!k)break;q[k.id]--}
    gd=0;
    while(S()<target&&gd++<900){
      const k=live.slice().sort((a,b)=>(base[b.id]-q[b.id])-(base[a.id]-q[a.id]))[0];q[k.id]++}
    T=S();

    // 便配分は「実際の発注」1便/2便/3便の総数（残り分）があればそれを優先し、なければ便構成比を使う
    const remBin=[0,1,2].map(i=>Math.max(0,(gvAiBin(i))-detailedBin[i]));
    const remSum=remBin[0]+remBin[1]+remBin[2];
    const gv=(id,d)=>{const v=$(id).value.trim();return v===''?d:Number(v)};
    R=remSum>0?remBin:[gv('r1',59),gv('r2',24),gv('r3',17)];
    const RS=R[0]+R[1]+R[2]||1;
    p1=R[0]/RS;p2=R[1]/RS;p3=R[2]/RS;
    const n3=p3<=0?0:Math.max(2,Math.round(T*p3/2));
    const top3=n3===0?[]:live.slice().sort((a,b)=>q[b.id]-q[a.id]).filter(r=>q[r.id]>=6).slice(0,n3).map(r=>r.id);

    live.forEach(r=>{
      const t3=top3.includes(r.id)?2:0,rest=Math.max(0,q[r.id]-t3);
      const t2=Math.round(rest*(p2/(p1+p2))),t1=rest-t2;
      setAll(r.id,fix2([t1,t2,t3],r.unit).map((x,i)=>itemBins(r,g).includes(i)?x:0))});
  }
  detailed.forEach(r=>setAll(r.id,vv(r.id,'i').map((x,i)=>itemBins(r,g).includes(i)?(x||0):0)));   // 対象外便は0
  g.items.forEach(r=>{if(!(r.id in q)&&!hasDetail(r))setAll(r.id,[0,0,0])});

  MODE='o';setMode('o');paintTotals();autosave();
  const s=sums('o');
  $('allocnote').className='note ok';
  $('allocnote').textContent=`${s.T}個 / ${s.amt.toLocaleString()}円　便別${R.join('/')}%`
    +(detailed.length?`　便別入力済み${detailed.length}品(${detailedTotal}個)はそのまま使用`:'')
    +(usedDemand?`　※目標未入力のため天気・曜日からの提案数(${tq}個)を使用`:'')
    +(tq&&!usedDemand?`　個数目標の${Math.round(s.T/tq*100)}%`:'')+(ta?`　金額目標の${Math.round(s.amt/ta*100)}%`:'')}
function gvAiBin(i){const v=$('ai'+(i+1)).value.trim();return v===''?0:Number(v)}
function setAll(id,v){const c=G().cur.v;c[id]=c[id]||{o:[null,null,null],i:[null,null,null],a:[null,null,null]};
  c[id].o=v.slice()}

/* ---------- 商品編集 ---------- */
function renderDClassOptions(){
  const sel=$('f_dclass');if(!sel)return;
  sel.textContent='';
  const blank=document.createElement('option');blank.value='';blank.textContent='未設定';sel.appendChild(blank);
  for(let d=0;d<=6;d++){const o=document.createElement('option');o.value=d;o.textContent='D'+d;sel.appendChild(o)}
}
function editItem(ix){EDIT=ix;const r=ix==null?{}:G().items[ix];
  renderDClassOptions();
  $('itTitle').textContent=ix==null?'商品を追加':'商品を編集';
  $('f_name').value=r.name||'';$('f_price').value=r.price??'';$('f_day').value=r.day??'';
  $('f_unit').value=String(r.unit||1);$('f_grade').value=r.grade||'○';
  $('f_my').value=r.my??'';$('f_tag').value=r.tag||'';$('f_memo').value=r.memo||'';
  $('f_margin').value=r.margin??'';
  $('f_dclass').value=r.dclass==null?'':String(r.dclass);
  $('dItem').showModal()}
function saveItem(){const n=$('f_name').value.trim();if(!n){alert('商品名を入れてください');return}
  const o={name:n,price:Number($('f_price').value)||0,day:Number($('f_day').value)||0,
    unit:Number($('f_unit').value)||1,grade:$('f_grade').value,my:Number($('f_my').value)||0,
    tag:$('f_tag').value.trim(),memo:$('f_memo').value.trim(),
    dclass:$('f_dclass').value===''?undefined:Number($('f_dclass').value),
    margin:$('f_margin').value===''?undefined:Number($('f_margin').value)};
  if(EDIT==null){o.id='i'+Date.now().toString(36)+Math.floor(Math.random()*1e4).toString(36);G().items.push(o)}
  else G().items[EDIT]=Object.assign(G().items[EDIT],o);
  $('dItem').close();renderTabs();paintTotals();autosave();flash('保存しました')}
function catInput(type,value,field,ix){const e=document.createElement('input');e.type=type;e.value=value??'';e.dataset.cat=field;e.dataset.ix=ix;return e}
function catSelect(options,value,field,ix){const e=document.createElement('select');options.forEach(([v,t])=>{const o=document.createElement('option');o.value=v;o.textContent=t;e.appendChild(o)});e.value=value==null?'':String(value);e.dataset.cat=field;e.dataset.ix=ix;return e}
function catBins(r,g,ix){const box=document.createElement('div');box.className='cat-bins';const a=itemBins(r,g);
  availBins(r,g).forEach(i=>{const lab=document.createElement('label');const cb=document.createElement('input');cb.type='checkbox';cb.checked=a.includes(i);cb.dataset.cat='bin'+i;cb.dataset.ix=ix;lab.append(cb,document.createTextNode((i+1)+'便'));box.appendChild(lab)});return box}
function openCatalog(){renderCatalog();$('dCatalog').showModal()}
function renderCatalog(){
  const g=G();$('catTitle').textContent=g.name;const tb=$('catbody');tb.textContent='';
  const bn=g.binNote?`便構成：${g.binNote}`:'';
  if(!g.items.length){$('catmsg').textContent=(bn?bn+'　':'')+'商品がありません。「＋商品」から登録してください。';return}
  $('catmsg').textContent=bn;
  const grades=[['◎','◎'],['○','○'],['△','△'],['×','×'],['新','新']],units=[['1','1個'],['2','2個']];
  g.items.forEach((r,ix)=>{const tr=document.createElement('tr');
    const fields=[catInput('text',r.name,'name',ix),catInput('number',r.price,'price',ix),catInput('number',r.day,'day',ix),
      catSelect(grades,r.grade||'○','grade',ix),catSelect(units,r.unit||1,'unit',ix),catSelect([['','—'],...DCLS.map(d=>[d,'D'+d])],r.dclass,'dclass',ix),catBins(r,g,ix),
      catInput('number',r.my,'my',ix),catInput('text',r.tag,'tag',ix),catInput('number',r.margin,'margin',ix),catInput('text',r.memo,'memo',ix)];
    fields.forEach((e,j)=>{const td=document.createElement('td');if(j===0)td.className='l';td.appendChild(e);tr.appendChild(td)});tb.appendChild(tr)})}
function saveCatalog(){
  const g=G();$('catbody').querySelectorAll('[data-cat]').forEach(e=>{const r=g.items[+e.dataset.ix],f=e.dataset.cat;if(!r)return;
    if(f.startsWith('bin'))return;
    if(f==='name')r.name=e.value.trim()||r.name;
    else if(f==='tag'||f==='memo')r[f]=e.value.trim();
    else if(f==='grade'||f==='unit'||f==='dclass')r[f]=e.value===''?undefined:(f==='unit'||f==='dclass'?Number(e.value):e.value);
    else r[f]=e.value===''?undefined:Number(e.value);
  });
  g.items.forEach((r,ix)=>{r.orderBins=[0,1,2].filter(i=>{const e=$(`catbody`).querySelector(`[data-cat="bin${i}"][data-ix="${ix}"]`);return e&&e.checked})});
  $('dCatalog').close();renderTabs();paintTotals();autosave();flash('品揃えマスターを保存しました')}
/* ---------- まとめて入力（1項目だけを縦に並べて入れる） ---------- */
const BULK_FIELDS={
  margin:{label:'値入率',unit:'%',step:'0.1',hint:r=>r.price?`売価${r.price}円`:'売価未設定'},
  day:{label:'日販',unit:'個',step:'0.1',hint:r=>r.memo&&r.memo.includes('仮')?r.memo:(r.price?`売価${r.price}円`:'')},
  price:{label:'売価(税抜)',unit:'円',step:'1',hint:r=>r.code?`コード${r.code}`:''},
  dclass:{label:'廃棄D',select:true,hint:r=>r.name.length>18?'':''},
  my:{label:'本部目安',unit:'個',step:'1',hint:()=>''}
};
let BULK_F='margin';
function openBulk(){
  if(!G().items.length){alert('先に商品を登録してください');return}
  BULK_F='margin';renderBulk();$('dBulk').showModal();
}
function setBulkField(f){
  if(!BULK_FIELDS[f])return;
  saveBulk(true);           // 切り替える前に、入力済みの値を保存する
  BULK_F=f;$('bulkAll').value='';renderBulk();
}
function renderBulk(){
  const g=G(),F=BULK_FIELDS[BULK_F];
  const M=$('bulkModes');M.textContent='';
  Object.entries(BULK_FIELDS).forEach(([k,v])=>{
    const b=document.createElement('button');b.textContent=v.label;
    b.setAttribute('aria-pressed',String(k===BULK_F));
    b.onclick=()=>setBulkField(k);M.appendChild(b);
  });
  $('bulkAll').placeholder=BULK_F==='dclass'?'例 3':'例 '+(BULK_F==='margin'?'32':BULK_F==='day'?'2':'1');
  const L=$('bulkList');L.textContent='';
  g.items.forEach((r,ix)=>{
    const row=document.createElement('div');row.className='bulk-row';
    const nm=document.createElement('div');nm.className='bn';
    nm.appendChild(document.createTextNode(r.name));
    const h=F.hint?F.hint(r):'';
    if(h){const sm=document.createElement('small');sm.textContent=h;nm.appendChild(sm)}
    let inp;
    if(F.select){
      inp=document.createElement('select');
      [['','—'],...DCLS.map(d=>[String(d),'D'+d])].forEach(([v,t])=>{
        const o=document.createElement('option');o.value=v;o.textContent=t;inp.appendChild(o)});
      inp.value=r.dclass==null?'':String(r.dclass);
    }else{
      inp=document.createElement('input');inp.type='number';inp.step=F.step||'1';
      inp.inputMode='decimal';
      inp.value=r[BULK_F]==null||r[BULK_F]===''?'':String(r[BULK_F]);
      inp.placeholder=F.unit||'';
    }
    inp.dataset.ix=ix;
    inp.addEventListener('input',()=>{row.classList.toggle('done',inp.value!=='')});
    if(inp.value!=='')row.classList.add('done');
    row.append(nm,inp);L.appendChild(row);
  });
  const filled=g.items.filter(r=>r[BULK_F]!=null&&r[BULK_F]!=='').length;
  $('bulkMsg').textContent=`${F.label}：${filled}/${g.items.length}品 入力済み`;
}
/* 空欄だけ、または全部に同じ値を入れる（入力の手間を減らすため） */
function bulkFill(onlyEmpty){
  const v=$('bulkAll').value.trim();
  if(v===''){$('bulkMsg').textContent='入れる値を左の欄に書いてください';return}
  $('bulkList').querySelectorAll('[data-ix]').forEach(e=>{
    if(onlyEmpty&&e.value!=='')return;
    e.value=v;e.parentElement.classList.add('done');
  });
  $('bulkMsg').textContent=(onlyEmpty?'空欄に':'全部に')+`${v}を入れました。保存を押すと反映します`;
}
function bulkFillEmpty(){bulkFill(true)}
function bulkFillAll(){bulkFill(false)}
function saveBulk(keepOpen){
  const g=G();let n=0;
  $('bulkList').querySelectorAll('[data-ix]').forEach(e=>{
    const r=g.items[+e.dataset.ix];if(!r)return;
    const v=e.value.trim();
    const now=v===''?undefined:Number(v);
    if((r[BULK_F]??undefined)!==now){r[BULK_F]=now;n++}
  });
  if(!keepOpen){$('dBulk').close();flash(n?`${n}品を保存しました`:'変更はありません')}
  renderItems();renderSetup();if(APP_TAB==='profit')renderProfit();autosave();
  return n;
}
function delItem(){if(EDIT==null){$('dItem').close();return}
  if(!confirm('この商品を消しますか')) return;
  const r=G().items[EDIT];delete G().cur.v[r.id];G().items.splice(EDIT,1);
  $('dItem').close();renderTabs();paintTotals();autosave()}

/* ---------- 履歴・目標 ---------- */
function openHist(){
  const t=new Date(Date.now()-86400000); // 前日から開始
  loadHistDate((t.getMonth()+1)+'/'+t.getDate());
  $('dHist').showModal()}
function loadHistDate(d){
  const g=G(),Y=new Date().getFullYear();
  const key=Y+'@'+d;
  const draft=g.histDrafts&&g.histDrafts[key];
  const r=draft||g.hist.find(x=>x.d===d&&(x.y||Y)===Y)||{};
  const set=(id,v)=>$(id).value=(v===null||v===undefined)?'':v;
  set('h_d',d);set('h_w',r.w);set('h_ai',r.ai);set('h_n',r.n);set('h_s',r.s);set('h_ha',r.ha);
  set('h_m',r.m);
  // 去年の同時期のメモを表示（なぜうまくいった/いかなかったかの振り返り用）
  showLastYearNote(d);
  autoHistWeather(d);
  const sb=r.sb||[null,null,null],hab=r.hab||[null,null,null];
  // 便別納品：記録済みならそれを、なければその日の発注データから自動入力
  let nb=r.nb;
  if(!nb&&g.cur.dt===d){const s=sums('i');if(s.T)nb=s.b}
  nb=nb||[null,null,null];
  set('h_n1',nb[0]);set('h_n2',nb[1]);set('h_n3',nb[2]);
  if(!r.n&&nb.some(x=>x!=null))set('h_n',nb.reduce((a,x)=>a+(x||0),0));
  set('h_s1',sb[0]);set('h_s2',sb[1]);set('h_s3',sb[2]);
  set('h_ha1',hab[0]);set('h_ha2',hab[1]);set('h_ha3',hab[2]);
}
function histDraftKey(d){return new Date().getFullYear()+'@'+d}
function saveHistDateDraft(){
  const d=($('h_d')&&$('h_d').value||'').trim();
  if(!orderDateParts(d))return;
  const g=G(),n=x=>$(x).value===''?null:Number($(x).value);
  g.histDrafts=g.histDrafts||{};
  g.histDrafts[histDraftKey(d)]={w:$('h_w').value,ai:n('h_ai'),n:n('h_n'),s:n('h_s'),ha:n('h_ha'),m:$('h_m').value,
    nb:['h_n1','h_n2','h_n3'].map(n),sb:['h_s1','h_s2','h_s3'].map(n),hab:['h_ha1','h_ha2','h_ha3'].map(n)};
  autosave();
}
function updateHistTotals(){
  const sum=ids=>{
    const vals=ids.map(id=>$(id).value===''?null:Number($(id).value));
    return vals.some(v=>v!==null)?vals.reduce((a,v)=>a+(v||0),0):null;
  };
  [['h_n',['h_n1','h_n2','h_n3']],['h_s',['h_s1','h_s2','h_s3']],['h_ha',['h_ha1','h_ha2','h_ha3']]].forEach(([out,ids])=>{
    const v=sum(ids);if(v!==null)$(out).value=v;
  });
}
/* ---------- メモ一覧（週ごと/月ごとにまとめて表示） ---------- */
let MEMO_VIEW='month';
function setMemoView(v){MEMO_VIEW=v;
  ['memoWeek','memoWeekMain'].forEach(id=>{if($(id))$(id).setAttribute('aria-pressed',String(v==='week'))});
  ['memoMonth','memoMonthMain'].forEach(id=>{if($(id))$(id).setAttribute('aria-pressed',String(v==='month'))});
  renderMemos();renderMainMemos()}
function renderMemos(){renderMemoList($('memolist'))}
function renderMainMemos(){
  const card=$('mainMemoCard');
  const on=DB.memoDisplay!==false;
  if(card)card.style.display=on?'':'none';
  if(on)renderMemoList($('mainMemolist'));
}
function memoDisplayWindow(){
  /* 今年の予定日の約2週間前に、前年の同時期メモを先に表示する */
  const now=new Date();now.setHours(0,0,0,0);now.setDate(now.getDate()+14);
  const target=new Date(now.getFullYear()-1,now.getMonth(),now.getDate());
  if(MEMO_VIEW==='month'){
    return{start:new Date(target.getFullYear(),target.getMonth(),1),end:new Date(target.getFullYear(),target.getMonth()+1,1)};
  }
  const start=new Date(target);start.setDate(start.getDate()-13);
  const end=new Date(target);end.setDate(end.getDate()+1);
  return{start,end};
}
function renderMemoList(el){
  if(!el)return;el.textContent='';
  const Y=new Date().getFullYear(),groups={},win=memoDisplayWindow();
  const records=(G().hist||[]).filter(h=>{
    if(!h.m)return;
    const m=(h.d||'').match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})/);if(!m)return;
    const y=h.y||Y;
    const date=new Date(y,+m[1]-1,+m[2]);
    return date>=win.start&&date<win.end;
  }).sort((a,b)=>{
    const pa=(a.d||'').match(/(\d+)\D+(\d+)/),pb=(b.d||'').match(/(\d+)\D+(\d+)/);
    return pa&&pb?(+(a.y||Y)*10000+ +pa[1]*100+ +pa[2])-(+(b.y||Y)*10000+ +pb[1]*100+ +pb[2]):0;
  });
  records.forEach(h=>{
    const m=(h.d||'').match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})/);if(!m)return;
    const y=h.y||Y;
    const key=MEMO_VIEW==='month'
      ? `${y}年${+m[1]}月`
      : `${y}年 ${weekKey(new Date(y,+m[1]-1,+m[2]))}の週`;
    (groups[key]=groups[key]||[]).push(`${h.d} ${h.m}`);
  });
  const keys=Object.keys(groups);
  if(!keys.length){const p=document.createElement('div');p.className='note';
    p.textContent='まだメモがありません。実績記録のメモ欄に施策やイベントを書くとここにまとまります。';
    el.appendChild(p);return}
  // 同じ時期の年違いが隣り合うよう、月日順→年順に並べる
  const sortKey=k=>{const y=(k.match(/^(\d{4})/)||[])[1]||'0';
    const md=k.match(/(\d{1,2})月/)||k.match(/(\d{1,2})\/(\d{1,2})/);
    const mo=md?+md[1]:0, da=md&&md[2]?+md[2]:0;
    return mo*10000+da*100+(9999-+y)};
  keys.sort((a,b)=>sortKey(a)-sortKey(b)).forEach(k=>{
    const w=document.createElement('div');w.className='row';
    const a=document.createElement('div');a.className='k';a.textContent=k;
    const b=document.createElement('div');b.className='v';b.textContent=groups[k].join(' ／ ');
    w.append(a,b);el.appendChild(w)});
}
/* 指定した年・期間(週/月)のメモをまとめて返す */
function memosIn(year,mo,da,span){
  const Y=new Date().getFullYear(),out=[];
  let from,to;
  if(span==='week'){
    const b=new Date(Y,mo-1,da);b.setDate(b.getDate()-((b.getDay()+6)%7));
    from=new Date(b);to=new Date(b);to.setDate(to.getDate()+6);
  }
  (G().hist||[]).forEach(h=>{
    if(!h.m)return;
    if((h.y||Y)!==year)return;
    const m=(h.d||'').match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})/);if(!m)return;
    if(span==='month'){ if(+m[1]!==mo)return }
    else{ const hd=new Date(Y,+m[1]-1,+m[2]); if(hd<from||hd>to)return }
    out.push(`${h.d} ${h.m}`);
  });
  return out}
/* 去年の同じ週・同じ月のメモをまとめて表示する */
function showLastYearNote(d){
  const el=$('h_lastyear');if(!el)return;el.textContent='';el.className='note';
  const m=(d||'').match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})/);if(!m)return;
  const thisYear=new Date().getFullYear();
  const ly=thisYear-1, mo=+m[1], da=+m[2];
  const wk=memosIn(ly,mo,da,'week'), mn=memosIn(ly,mo,da,'month');
  const lines=[];
  if(wk.length)lines.push(`【去年の同じ週】${wk.join(' ／ ')}`);
  const only=mn.filter(x=>!wk.includes(x));
  if(only.length)lines.push(`【去年の同じ月・その他】${only.join(' ／ ')}`);
  if(lines.length){el.className='note ok';el.textContent='📌 '+lines.join('　')}
  else{el.className='note';el.textContent=`去年（${ly}年）の${mo}月にはメモがありません`}
}
function shiftHistDate(dir){
  saveHistDateDraft();
  const m=($('h_d').value||'').match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})/);
  const now=new Date();
  let base=m?new Date(now.getFullYear(),+m[1]-1,+m[2]):new Date(Date.now()-86400000);
  base.setDate(base.getDate()+dir);
  loadHistDate((base.getMonth()+1)+'/'+base.getDate());
}
function saveHist(){const n=x=>{const v=$(x).value;return v===''?null:Number(v)};
  updateHistTotals();
  const d=$('h_d').value.trim()||$('dt').value.trim();if(!d){alert('日付を入れてください');return}
  const nb=[n('h_n1'),n('h_n2'),n('h_n3')],sb=[n('h_s1'),n('h_s2'),n('h_s3')],hab=[n('h_ha1'),n('h_ha2'),n('h_ha3')];
  const Y=new Date().getFullYear();
  const i=G().hist.findIndex(h=>h.d===d&&(h.y||Y)===Y);
  const old=i>=0?G().hist[i]:{};
  const pick=(v,o)=>v===null||v===''||v===undefined?(o??null):v;
  const rec={d,w:pick($('h_w').value.trim(),old.w),ai:pick(n('h_ai'),old.ai),n:pick(n('h_n'),old.n),
    s:pick(n('h_s'),old.s),ha:pick(n('h_ha'),old.ha),
    m:pick($('h_m').value.trim(),old.m),am:old.am??null,kk:old.kk??null,k:old.k??null,
    y:old.y??Y,
    nb:nb.some(x=>x!==null)?nb:(old.nb||null),sb:sb.some(x=>x!==null)?sb:(old.sb||null),
    hab:hab.some(x=>x!==null)?hab:(old.hab||null)};
  if(rec.ha==null&&rec.hab)rec.ha=rec.hab.reduce((a,x)=>a+(x||0),0);
  if(rec.s==null&&rec.sb)rec.s=rec.sb.reduce((a,x)=>a+(x||0),0)||null;
  if(rec.n==null&&rec.nb)rec.n=rec.nb.reduce((a,x)=>a+(x||0),0)||null;
  if(i>=0)G().hist[i]=rec;else G().hist.push(rec);
  if(G().histDrafts)delete G().histDrafts[Y+'@'+d];
  G().hist.sort((a,b)=>{const p=s=>{const m=(s.d||'').match(/(\d+)\D+(\d+)/);return m?+m[1]*100+ +m[2]:0};return p(a)-p(b)});
  $('dHist').close();renderHist();renderSetup();autosave();flash('記録しました')}
function saveBase(){const g=G();
  g.base=Number($('s_base').value)||0;g.up=Number($('s_up').value)||1;
  g.shelf=Number($('s_shelf').value)||0;g.cycle=Number($('s_cycle').value)||0;
  g.binNote=$('s_binnote').value.trim();
  g.margin=$('s_margin').value===''?undefined:Number($('s_margin').value);
  renderSetup();if(APP_TAB==='profit')renderProfit();autosave();flash('保存しました')}
/* 特殊カレンダー(GW/お盆/年末年始)と当日(集計未確定)を除いた実績平均を提案する */
function suggestBase(){
  const g=G();
  const todayStr=(()=>{const t=new Date();return (t.getMonth()+1)+'/'+t.getDate()})();
  const vals=g.hist.filter(h=>h.s!=null&&h.d!==todayStr&&!specialPeriod(h.d)).map(h=>h.s);
  if(!vals.length)return null;
  return{avg:Math.round(vals.reduce((a,b)=>a+b,0)/vals.length),n:vals.length}}
function applySuggestBase(){const s=suggestBase();if(!s){alert('実績データが足りません');return}
  $('s_base').value=s.avg;flash('提案値を反映しました（保存ボタンを押してください）')}
function saveTgt(){const d=$('tg_d').value.trim();if(!d)return;
  const m=d.match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})/);if(!m){alert('8/22 のように入れてください');return}
  G().tgt[+m[1]+'/'+ +m[2]]={q:Number($('tg_q').value)||0,a:Number($('tg_a').value)||0};
  renderSet();renderSetup();autosave()}
function renderSet(){const g=G(),B=$('setbody');B.textContent='';
  $('wipeToggle').style.display='';$('wipeBtn').style.display='none';
  $('s_base').value=g.base||'';$('s_up').value=g.up||1;$('gas_url').value=getGasUrl();
  $('s_shelf').value=g.shelf||'';$('s_cycle').value=g.cycle||'';$('s_binnote').value=g.binNote||'';
  $('s_margin').value=g.margin??'';
  $('loc_status').textContent='現在の地域: '+getLoc().name;
  renderMemoDisplaySetting();renderMemos();renderBinMx();
  const sug=suggestBase();
  $('s_base_sug').textContent=sug?`実績平均(特殊カレンダー・当日除く、${sug.n}日分): ${sug.avg}個`:'実績データがまだ足りません';
  const L=learnDow();
  ['月','火','水','木','金','土','日'].forEach(d=>{
    const w=document.createElement('div');w.className='row';
    const k=document.createElement('div');k.className='k';k.textContent=d+'曜';
    const v=document.createElement('div');v.className='v';
    const f=(L&&L.f[d])||g.dow[d];
    v.textContent=f.toFixed(2)+((L&&L.f[d])?`（自店${L.cnt[d]}日 学習）`:'（初期値）');
    w.append(k,v);B.appendChild(w)});
  const t=$('tglist');t.textContent=Object.keys(g.tgt).length
    ? '登録済: '+Object.entries(g.tgt).map(([k,v])=>`${k} ${v.q}個/${(v.a||0).toLocaleString()}円`).join('　')
    : '目標はまだありません'}
/* ---------- 便と廃棄の時間マスタ（ジャンルごとに固定） ---------- */
/* 便ごとの納品時刻・廃棄時刻を保持する。d は旧版データ互換用に残す */
const BINT=[2,5,11,14,18,21,24];
const DCLS=[0,1,2,3,4,5,6];
/* d/t の旧版データも読めるように保持する */
function binmx(g){
  g=g||G();
  if(!g.binmx)g.binmx={deliv:[],waste:[]};
  ['deliv','waste'].forEach(k=>{
    if(!Array.isArray(g.binmx[k]))g.binmx[k]=[];
    for(let i=0;i<3;i++)if(!g.binmx[k][i])g.binmx[k][i]={d:null,t:[]};
    g.binmx[k].length=3});
  if(!Array.isArray(g.binmx.dEnabled))g.binmx.dEnabled=[];
  if(!Array.isArray(g.binmx.wasteD))g.binmx.wasteD=[];
  DCLS.forEach(d=>{
    if(!Array.isArray(g.binmx.wasteD[d]))g.binmx.wasteD[d]=[];
    for(let i=0;i<3;i++)if(!g.binmx.wasteD[d][i])g.binmx.wasteD[d][i]={t:[]};
    g.binmx.wasteD[d].length=3;
  });
  // 旧版のジャンル共通設定はD0として引き継ぐ
  if(!g.binmx.dMigrated&&g.binmx.waste.some(x=>x.t&&x.t.length)){
    g.binmx.waste.forEach((x,i)=>g.binmx.wasteD[0][i].t=x.t.slice());
    if(!g.binmx.dEnabled.includes(0))g.binmx.dEnabled.push(0);
    g.binmx.dMigrated=true;
  }
  // 旧版データに残る日数情報は互換用に補正する
  if(!g.binmx.rel){
    for(let i=0;i<3;i++){const dv=g.binmx.deliv[i],wt=g.binmx.waste[i];
      if(wt.d!=null&&dv.d!=null)wt.d=Math.max(0,wt.d-dv.d)}
    g.binmx.rel=true}
  return g.binmx}
function bmGenKey(){const el=$('bm_gen');return (el&&el.value)||DB.active}
function bmGroup(){return DB.g[bmGenKey()]||G()}
function setBinDay(kind,i,v){const m=binmx(bmGroup());
  m[kind][i].d=v===''?null:Number(v);renderBinMx();autosave()}
function setDEnabled(d,on){const m=binmx(bmGroup());
  m.dEnabled=m.dEnabled.filter(x=>x!==d);if(on)m.dEnabled.push(d);m.dEnabled.sort((a,b)=>a-b);
  BM_EDIT=true;renderBinMx();autosave()}
function toggleDWaste(d,i,t,on){const m=binmx(bmGroup()),a=m.wasteD[d][i];
  a.t=(a.t||[]).filter(x=>x!==t);if(on)a.t.push(t);
  a.t.sort((x,y)=>x-y);BM_EDIT=true;renderBinMx();autosave()}
/* 納品〜廃棄の時間差。日と時刻が両方そろっている便だけ計算できる */
function binSpan(g,i){
  const m=binmx(g),dv=m.deliv[i],wt=m.waste[i];
  if(dv.d==null||!dv.t.length||wt.d==null||!wt.t.length)return null;
  const from=dv.d*24+Math.min(...dv.t), to=(dv.d+wt.d)*24+Math.max(...wt.t);
  return to>from?to-from:null}
function binSummaryLines(g){
  const m=binmx(g),out=[];const times=a=>a&&a.length?a.join('時・')+'時':'未設定';
  m.dEnabled.forEach(d=>{for(let i=0;i<3;i++){
    const wt=m.wasteD[d][i];if(wt.t.length)out.push(`D${d}・${i+1}便：廃棄 ${times(wt.t)}`);
  }});
  return out}
/* マスタに登録のある便だけを使う。未登録のジャンルは従来どおり1〜3便すべて */
/* ジャンル全体で使う便（g.bins）。便と廃棄の時間マスタが未登録のジャンル用の既定値。
   例：デザートは1便・2便しか入らない。未設定なら従来どおり1〜3便すべて */
function genreBins(g){
  const b=((g&&g.bins)||[]).filter(i=>Number.isInteger(i)&&i>=0&&i<3);
  return b.length?[...new Set(b)].sort((a,b)=>a-b):[0,1,2];
}
/* マスタに登録のある便を優先し、無ければジャンルの既定便を使う */
function binsFromMaster(g){
  const m=binmx(g),out=[];
  for(let i=0;i<3;i++)if(m.dEnabled.some(d=>m.wasteD[d][i].t.length))out.push(i);
  return out;
}
function itemBins(r,g){
  if(Array.isArray(r&&r.orderBins))return r.orderBins;
  g=g||G();
  const out=binsFromMaster(g);
  return out.length?out:genreBins(g);
}
function binsUsed(g){
  g=g||G();
  if(g.items&&g.items.some(r=>Array.isArray(r.orderBins))){
    const set=new Set();g.items.forEach(r=>itemBins(r,g).forEach(i=>set.add(i)));
    return set.size?[...set].sort((a,b)=>a-b):genreBins(g);
  }
  if(!g.binmx)return genreBins(g);
  const out=binsFromMaster(g);
  return out.length?out:genreBins(g)}
/* 品揃えマスターで選べる便。ジャンルで使う便と、その商品にすでに入っている便を出す */
function availBins(r,g){
  const base=binsFromMaster(g);
  const set=new Set(base.length?base:genreBins(g));
  if(Array.isArray(r&&r.orderBins))r.orderBins.forEach(i=>set.add(i));
  return [...set].sort((a,b)=>a-b);
}
/* 便の見出しに廃棄時刻を添える（例「2便 14時廃棄」） */
function itemDClass(r){const d=Number(r&&r.dclass);return Number.isInteger(d)&&d>=0&&d<=6?d:null}
function binLabel(g,i,short,r){
  const base=(i+1)+'便';
  g=g||G();
  if(!g.binmx)return base;
  const m=binmx(g),d=itemDClass(r);
  const t=d==null?m.dEnabled.flatMap(x=>m.wasteD[x][i].t):m.wasteD[d][i].t;
  if(!t||!t.length)return base;
  return base+(short?' ':'\n')+t.filter((x,j,a)=>a.indexOf(x)===j).join('・')+'時廃棄'}
let BM_EDIT=false;
function bmEdit(on){BM_EDIT=on;renderBinMx()}
function bmSwitchGen(){BM_EDIT=false;renderBinMx()}
function renderBinMx(){
  const sel=$('bm_gen');if(!sel)return;
  if(!sel.options.length){
    GEN.forEach(([k,nm])=>{const o=document.createElement('option');o.value=k;o.textContent=nm;sel.appendChild(o)});
    sel.value=DB.active}
  const g=bmGroup(),m=binmx(g);
  const dl=$('bmdlist');dl.textContent='';
  DCLS.forEach(d=>{const lab=document.createElement('label');lab.className='gh sm';lab.style.display='inline-flex';lab.style.gap='4px';
    const cb=document.createElement('input');cb.type='checkbox';cb.checked=m.dEnabled.includes(d);cb.style.width='18px';
    cb.onchange=e=>setDEnabled(d,e.target.checked);lab.append(cb,document.createTextNode('D'+d));dl.appendChild(lab)});
  const th=$('bmth'),done=binSummaryLines(g).length>0;
  // 登録済みのジャンルは、登録した便だけを一覧で見せる（編集ボタンで表に戻す）
  $('bmwrap').style.display=(done&&!BM_EDIT)?'none':'';
  $('bmhelp').style.display=(done&&!BM_EDIT)?'none':'';
  $('bmEditBtn').style.display=(done&&!BM_EDIT)?'':'none';
  $('bmDoneBtn').style.display=(done&&!BM_EDIT)?'none':'';
  th.textContent='';
  const hr=document.createElement('tr');
  [['便','l'],['時刻','']].forEach(([t,c])=>{
    const e=document.createElement('th');e.className=c;e.textContent=t;hr.appendChild(e)});
  BINT.forEach(t=>{const e=document.createElement('th');e.style.textAlign='center';e.textContent=t+'時';hr.appendChild(e)});
  th.appendChild(hr);
  const tb=$('bmtb');tb.textContent='';
  m.dEnabled.forEach(d=>{
    const hd=document.createElement('tr');
    const hc=document.createElement('td');hc.className='l';hc.colSpan=2+BINT.length;
    hc.style.fontWeight='700';hc.style.background='var(--bg)';hc.textContent='D'+d+' 廃棄時刻';
    hd.appendChild(hc);tb.appendChild(hd);
    for(let i=0;i<3;i++){
      const tr=document.createElement('tr');
      const c1=document.createElement('td');c1.className='l';c1.textContent=(i+1)+'便';tr.appendChild(c1);
      const c2=document.createElement('td');c2.textContent='時刻';c2.style.color='var(--muted)';tr.appendChild(c2);
      BINT.forEach(t=>{
        const c=document.createElement('td');c.style.textAlign='center';
        const cb=document.createElement('input');cb.type='checkbox';
        cb.style.width='20px';cb.style.height='20px';cb.style.padding='0';
        cb.checked=m.wasteD[d][i].t.includes(t);
        cb.onchange=e=>toggleDWaste(d,i,t,e.target.checked);
        c.appendChild(cb);tr.appendChild(c)});
      tb.appendChild(tr)}
  });
  const sum=$('bmsum');sum.textContent='';
  const lines=binSummaryLines(g);
  if(!lines.length){sum.className='note';sum.textContent='まだ設定されていません。'}
  else{sum.className='note ok';lines.forEach(x=>{const d=document.createElement('div');d.textContent=x;sum.appendChild(d)})}
}
function showWipe(){$('wipeToggle').style.display='none';$('wipeBtn').style.display='';}
function wipe(){if(!confirm('この端末のデータを全部消します。よろしいですか'))return;
  localStorage.removeItem(KEY);location.hash='';location.reload()}

/* ---------- 週次データ取り込み（写真→AI→貼り付け） ---------- */
function driveFileKey(file){
  return [file.name,file.size,file.lastModified,file.type].join('|');
}
function renderDriveFiles(){
  const el=$('driveFileList');if(!el)return;el.textContent='';
  if(!DRIVE_FILES.length){el.textContent='まだファイルが選択されていません。';return}
  DRIVE_FILES.forEach((entry,i)=>{
    const row=document.createElement('div');row.className='drive-file-row';
    const name=document.createElement('span');name.textContent=entry.file.name;name.title=entry.file.name;
    const del=document.createElement('button');del.className='gh sm';del.textContent='×';del.title='選択から外す';
    del.onclick=()=>{DRIVE_FILES.splice(i,1);renderDriveFiles()};
    row.append(name,del);el.appendChild(row);
  });
}
function addDriveFiles(files){
  const existing=new Set(DRIVE_FILES.map(x=>driveFileKey(x.file)));
  Array.from(files||[]).forEach(file=>{
    const key=driveFileKey(file);
    if(existing.has(key))return;
    existing.add(key);
    DRIVE_FILES.push({file,category:'unclassified'});
    if(file.type&&file.type.startsWith('image/'))LAST_CAPTURED_FILE=file;
  });
  renderDriveFiles();
}
function bytesToBase64(buf){
  const bytes=new Uint8Array(buf),chunk=0x8000;let out='';
  for(let i=0;i<bytes.length;i+=chunk)out+=String.fromCharCode(...bytes.subarray(i,Math.min(i+chunk,bytes.length)));
  return btoa(out);
}
async function uploadDriveFiles(){
  const url=getGasUrl(),month=$('driveMonth')?.value;
  if(!url){alert('先に設定でGAS URLを確認してください');return}
  if(!month){alert('対象月を選択してください');return}
  if(!DRIVE_FILES.length){alert('画像またはPDFを選択してください');return}
  const btn=$('driveUploadBtn'),msg=$('driveMsg');btn.disabled=true;
  let done=0;
  const pending=[...DRIVE_FILES];
  try{
    for(const entry of pending){
      msg.textContent=`送信中 ${done+1}/${pending.length}：${entry.file.name}`;
      const data=bytesToBase64(await entry.file.arrayBuffer());
      await fetch(url,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({
        mode:'upload',month,category:'unclassified',name:entry.file.name,mimeType:entry.file.type||'application/octet-stream',data
      })});
      done++;
      const index=DRIVE_FILES.indexOf(entry);
      if(index>=0)DRIVE_FILES.splice(index,1);
      renderDriveFiles();
    }
    msg.className='note ok';msg.textContent=`✓ ${done}件を送信しました。Drive側で保存を確認してください。`;
  }catch(e){msg.className='note crit';msg.textContent=`⚠ ${done}件送信後に停止しました。通信を確認して再実行してください。`}
  finally{btn.disabled=false}
}
function initDriveImport(){
  const month=$('driveMonth');if(month){const n=new Date();month.value=`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`}
  $('driveFiles')?.addEventListener('change',e=>addDriveFiles(e.target.files));
  renderDriveFiles();
}
const WK_TASKS={
  mon:{label:'月曜：先週実績の写真',
    guide:'ストコン「店舗分析→日別時系列推移グラフ（中分類：{gen}）」を数量表示で撮影（1枚）'},
  tue:{label:'火曜：品揃え・新商品の写真',
    guide:'ストコン「発注→品揃え状況確認・修正（{gen}）」を全ページ撮影（6枚前後）'},
  mid:{label:'発注前：中分類総数の写真',
    guide:'ストコン「中分類総数（{gen}）」を撮影。現在庫・納品予定・便別の繰越を取り込む'},
  newp:{label:'新商品：新商品案内明細の写真',
    guide:'ストコン「新商品案内明細（{gen}）」を撮影。売価・原価・値入率・商品コードを取り込む'},
  rank:{label:'商品登録：売上ランキングの写真',
    guide:'ストコン「店舗分析→売上ランキング（{gen}）」を数量と金額の両方で撮影。商品名・売価・販売数・廃棄数を取り込む'}
};
const WK_SAMPLES={
  mon:{title:'月曜：日別時系列推移グラフ',cols:['日付','AI推奨','納品','販売','廃棄'],rows:[['8/24','134','134','126','14'],['8/25','128','130','121','9']],note:'中分類名と日付が見える状態で、数量表示を1枚撮影します。集計途中の当日と未来日は不要です。'},
  tue:{title:'火曜：品揃え状況確認・修正',cols:['商品名','売価','値入率','AI推奨','週販売／廃棄'],rows:[['商品A','198','40.4%','4／2／0','40／2'],['商品B','238','38.0%','3／1／0','32／1']],note:'商品名から4週分の販売・廃棄まで見えるように撮影します。複数ページは全ページ必要です。'},
  mid:{title:'発注前：中分類総数',cols:['区分','現在庫','納品予定','1便','2便','3便'],rows:[['中分類計','71','38','14','—','—'],['小分類A','34','7','7','12','0']],note:'発注日、中分類名、現在庫、納品予定、便別繰越が一緒に見える状態で撮影します。'},
  rank:{title:'商品登録：売上ランキング',cols:['商品名','商品コード','売価','販売','廃棄'],rows:[['商品A','19401450','334','7','0'],['商品B','19401451','298','5','1']],note:'対象期間と更新日時が見える状態で、「数量」と「金額」の表示をそれぞれ撮影します。'},
  newp:{title:'新商品：新商品案内明細',cols:['商品名','売価','原価','値入率','商品コード','入数'],rows:[['新商品A','198','125.25','36.7%','0410113','1'],['新商品B','248','156.24','37.0%','0410114','1']],note:'日付と発注開始日を含め、1枚に写る商品をすべて撮影します。'}
};
function renderWeeklySample(type){
  const s=WK_SAMPLES[type]||WK_SAMPLES.mon;
  const W=720,H=250,left=18,top=76,rowH=48;
  const colW=(W-left*2)/s.cols.length;
  const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let cells='';
  s.cols.forEach((v,i)=>{cells+=`<rect x="${left+i*colW}" y="${top}" width="${colW}" height="36" fill="#e8eef8" stroke="#9aa9bd"/><text x="${left+i*colW+colW/2}" y="${top+23}" text-anchor="middle" font-size="13" font-weight="700" fill="#26364a">${esc(v)}</text>`});
  s.rows.forEach((row,r)=>row.forEach((v,i)=>{const y=top+36+r*rowH;cells+=`<rect x="${left+i*colW}" y="${y}" width="${colW}" height="${rowH}" fill="white" stroke="#c7d0dc"/><text x="${left+i*colW+colW/2}" y="${y+29}" text-anchor="middle" font-size="13" fill="#26364a">${esc(v)}</text>`}));
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" rx="14" fill="#f4f7fb"/><rect x="12" y="12" width="696" height="44" rx="7" fill="#1e4f91"/><text x="28" y="40" font-family="sans-serif" font-size="18" font-weight="700" fill="white">ストコン画面例　${esc(s.title)}</text>${cells}<rect x="10" y="68" width="700" height="150" rx="8" fill="none" stroke="#ef4444" stroke-width="5" stroke-dasharray="10 6"/><text x="700" y="240" text-anchor="end" font-family="sans-serif" font-size="12" fill="#c92a2a">赤枠が写真に入るように撮影</text></svg>`;
  $('wkSampleTitle').textContent=s.title+' の撮影例';
  $('wkSampleImg').src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
  $('wkSampleImg').alt=s.title+'で写真に含める項目のサンプル';
  $('wkSampleNote').textContent=s.note+' ※実際のストコン画像ではなく説明用の模式図です。';
}
function copyWeeklyPrompt(type){
  if(type==='newp'){
    const p=`あなたはコンビニ発注データの読み取りアシスタントです。添付した「新商品案内明細」画面の写真から、次の形式の1行だけを出力してください（説明文・前置きは一切不要）。
#UPD1:{"type":"new","d":"8/24","items":[{"name":"手巻 シーチキンマヨネーズ","price":198,"cost":125.25,"margin":36.7,"code":"0410113","unit":1,"start":"08/24"}]}
ルール:
- d=画面上部の「日付」(月/日)
- name=商品名 price=「売価」 cost=「原価」 margin=「値入率」 unit=「入数」
- code=「商品コード」の左端の1つ start=「発注開始日」(月/日)
- 1枚に2商品ずつ写っている場合は両方を、複数枚ある場合は全部の商品をitemsに入れる
- 「売価 − 原価 ÷ 売価」が値入率とだいたい合うか確かめ、合わない行はcostとmarginをnullにする
- 読み取れない値はnullにして、数字を推測で埋めない`;
    LAST_AI_PROMPT=p;
    navigator.clipboard.writeText(p).then(()=>flash('プロンプトをコピーしました'))
      .catch(()=>{$('out').value=p;flash('下の書き出し枠からコピーしてください')});
    return;
  }
  if(type==='rank'){
    const p=`あなたはコンビニ発注データの読み取りアシスタントです。添付した「売上ランキング」画面の写真から、次の形式の1行だけを出力してください（説明文・前置きは一切不要）。
#UPD1:{"type":"rank","gen":"手づくりデザート","from":"8/24","upd":"8/25","items":[{"name":"スフレ・プリン","code":"19401450","price":334,"s":7,"w":null}]}
ルール:
- gen=画面上部の「中分類」（無ければ「大分類」）の名前
- from=「対象期間」の開始日(月/日) upd=右上の「更新日時」の日付(月/日)
- name=商品名（写真の表記のまま） code=商品コード price=売価（¥の数字をそのまま）
- s=自店の「販売」の数量 w=自店の「廃棄」の数量。空欄はnull
- 数量表示と金額表示の写真が両方ある場合は、数量表示のほうの数字を使う
- 金額表示の写真があるときは「売価×数量＝金額」が合うか確かめ、合わない行はnullにする
- 画面に写っている全商品を含め、読み取れない値はnullにして推測で埋めない`;
    LAST_AI_PROMPT=p;
    navigator.clipboard.writeText(p).then(()=>flash('プロンプトをコピーしました'))
      .catch(()=>{$('out').value=p;flash('下の書き出し枠からコピーしてください')});
    return;
  }
  if(type==='mid'){
    const p=`あなたはコンビニ発注データの読み取りアシスタントです。添付した「中分類総数」画面の写真から、次の形式の1行だけを出力してください（説明文・前置きは一切不要）。
#UPD1:{"type":"mid","gen":"手づくりデザート","d":"8/25","stock":71,"plan":38,"carry":[14,null,null],"sub":[{"name":"ケーキ","stock":34,"plan":7,"items":[7,12,0]}]}
ルール:
- gen=画面上部の「中分類」の名前 d=画面上部の「発注日」(月/日)
- stock=中分類の「現在庫」 plan=中分類の「納品予定」
- carry=「繰越」の行のうち、発注日の列にある1便/2便/3便の数字。空欄はnull
- sub=小分類ごとに {name:小分類名, stock:現在庫, plan:納品予定, items:「アイテム数」の総数の1便/2便/3便}
- 小分類は画面に写っている分だけ含める。読み取れない値はnullにして、数字を推測で埋めない`;
    LAST_AI_PROMPT=p;
    navigator.clipboard.writeText(p).then(()=>flash('プロンプトをコピーしました'))
      .catch(()=>{$('out').value=p;flash('下の書き出し枠からコピーしてください')});
    return;
  }
  const p=type==='mon'
    ? `あなたはコンビニ発注データの読み取りアシスタントです。添付した「日別時系列推移グラフ（中分類）」画面の写真から、当年の日別実績を読み取り、次の形式の1行だけを出力してください（説明文・前置きは一切不要）。
#UPD1:{"type":"mon","days":[{"d":"8/17","ai":134,"n":134,"s":126,"ha":14}]}
ルール:
- d=日付(月/日) ai=AI推奨 n=納品 s=販売 ha=廃棄。写真に写っている日をすべて含める
- 読み取れない・空欄の値はnull
- 集計途中の当日や、まだ実績のない未来日は含めない`
    : `あなたはコンビニ発注データの読み取りアシスタントです。添付した「品揃え状況確認・修正」画面の写真（全ページ）から商品ごとの情報を読み取り、次の形式の1行だけを出力してください（説明文・前置きは一切不要）。
#UPD1:{"type":"tue","items":[{"name":"直巻 明太子マヨネーズ","price":198,"margin":40.4,"ai":[4,2,0],"ws":[40,46,38,35],"ww":[2,2,0,1],"new":false}]}
ルール:
- name=商品名（写真の表記のまま） price=売価 margin=値入率%
- ai=AI推奨値の1便/2便/3便（空欄は0）
- ws=週販売数（4週前→直近週の順）、ww=週廃棄数（同順）。空欄は0
- ランクに「導入」や赤い導入マークがある商品は new を true に
- 全ページの全商品を含め、読み取れない値はnull`;
  LAST_AI_PROMPT=p;
  navigator.clipboard.writeText(p).then(()=>flash('プロンプトをコピーしました'))
    .catch(()=>{$('out').value=p;flash('下の書き出し枠からコピーしてください')});
}
async function sendWeeklyToChatGPT(){
  const type=$('wkAiType')?.value||'mon';
  copyWeeklyPrompt(type);
  const file=LAST_CAPTURED_FILE||[...DRIVE_FILES].reverse().find(x=>x.file.type&&x.file.type.startsWith('image/'))?.file;
  if(file&&navigator.share){
    const payload={title:'発注データ読み取り',text:LAST_AI_PROMPT,files:[file]};
    try{
      if(!navigator.canShare||navigator.canShare({files:[file]})){
        await navigator.share(payload);flash('写真とプロンプトを共有しました');return;
      }
    }catch(e){if(e&&e.name==='AbortError')return}
  }
  try{await navigator.clipboard.writeText(LAST_AI_PROMPT)}catch(e){}
  window.open('https://chatgpt.com/','_blank','noopener');
  alert(file?'写真の自動共有に対応していないため、プロンプトだけコピーしました。ChatGPTで写真を添付して貼り付けてください。':'先に上の「画像・PDFを選択」から写真を選んでください。プロンプトはコピーしました。');
}
function normName(s){return (s||'').replace(/[\s　・！!（）()]/g,'')}
/* 売上ランキングの対象期間が何日分か。開始日と更新日から数える（当日は集計途中のため含めない） */
function rankDays(from,upd){
  const a=orderDateParts(from),b=orderDateParts(upd);
  if(!a||!b)return 1;
  const y=new Date().getFullYear();
  const s=new Date(y,a.mo-1,a.da), e=new Date(y,b.mo-1,b.da);
  const n=Math.round((e-s)/86400000);
  return Math.max(1,Math.min(7,n));
}
/* 蓄積した週次スナップショットから、その商品の週販売数の推移を返す */
function itemTrend(g,name){
  const nx=normName(name),out=[];
  (g.snap||[]).forEach(s=>{
    if(s.type!=='tue'||!Array.isArray(s.items))return;
    const it=s.items.find(x=>{const ni=normName(x.name);return ni===nx||ni.includes(nx)||nx.includes(ni)});
    if(!it||!Array.isArray(it.ws))return;
    const v=it.ws[it.ws.length-1];
    if(v!=null)out.push({week:s.week,sales:v});
  });
  return out}
/* 直近の月曜日を「その週」のキーにする（例 8/17） */
function weekKey(dt){const d=dt?new Date(dt):new Date();
  const off=(d.getDay()+6)%7; d.setDate(d.getDate()-off);
  return (d.getMonth()+1)+'/'+d.getDate()}
/* 週次スナップショットを積み上げる。同じ週は上書き、日付順に保つ */
function pushSnapshot(g,type,payload){
  g.snap=g.snap||[];
  const wk=weekKey();
  const i=g.snap.findIndex(s=>s.week===wk&&s.type===type);
  const rec={week:wk,type,at:new Date().toISOString().slice(0,10),...payload};
  if(i>=0)g.snap[i]=rec;else g.snap.push(rec);
  g.snap.sort((a,b)=>{const p=s=>{const m=(s.week||'').match(/(\d+)\D+(\d+)/);return m?+m[1]*100+ +m[2]:0};
    return p(a)-p(b)||a.type.localeCompare(b.type)});
}
function importWeekly(){
  const m=$('wkbox').value.match(/#UPD1:\s*(\{[\s\S]*\})/);
  const msg=$('wkmsg');
  if(!m){msg.className='note crit';msg.textContent='「#UPD1:」で始まるデータが見つかりません。AIの返信をそのまま貼り付けてください。';return}
  let d;try{d=JSON.parse(m[1])}catch(e){msg.className='note crit';msg.textContent='データを読めませんでした（形式エラー）。AIにもう一度形式どおりの出力を頼んでください。';return}
  const g=G();g.wk=g.wk||{};
  const today=(()=>{const t=new Date();return (t.getMonth()+1)+'/'+t.getDate()})();
  if(d.type==='mon'&&Array.isArray(d.days)){
    let cnt=0;
    d.days.forEach(x=>{
      if(!x.d)return;
      const i=g.hist.findIndex(h=>h.d===x.d);
      const old=i>=0?g.hist[i]:{};
      const pick=(v,o)=>(v===null||v===undefined)?(o??null):v;
      const rec={...old,d:x.d,ai:pick(x.ai,old.ai),n:pick(x.n,old.n),s:pick(x.s,old.s),ha:pick(x.ha,old.ha)};
      if(i>=0)g.hist[i]=rec;else g.hist.push(rec);
      cnt++});
    g.hist.sort((a,b)=>{const p=s=>{const mm=(s.d||'').match(/(\d+)\D+(\d+)/);return mm?+mm[1]*100+ +mm[2]:0};return p(a)-p(b)});
    g.wk.mon=today;
    pushSnapshot(g,'mon',{days:d.days});
    msg.className='note ok';msg.textContent=`✓ ${g.name}に${cnt}日分の実績を履歴に取り込みました（曜日係数・週平均の学習に使われます）`
      +`　（${weekKey()}週として蓄積：計${(g.snap||[]).length}件）`;
  }else if(d.type==='tue'&&Array.isArray(d.items)){
    let upd=0,added=0,dayFilled=0;const miss=[];
    const addAll=!!($('wkAddNew')&&$('wkAddNew').checked);   // 商品未登録のジャンルを写真から作るとき用
    /* 週販売数（4週）から1日あたりの販売数を出す。直近週を優先し、無ければ有効な週の平均。
       実績から計算した値であり、勝手な想定値は入れない */
    const dayFromWeek=ws=>{
      if(!Array.isArray(ws))return null;
      const v=ws.filter(n=>n!=null&&n>=0);
      if(!v.length)return null;
      const last=ws.slice().reverse().find(n=>n!=null&&n>0);
      const base=last!=null?last:(v.reduce((a,b)=>a+b,0)/v.length);
      return Math.round(base/7*10)/10;
    };
    d.items.forEach(x=>{
      if(!x.name)return;
      const nx=normName(x.name);
      let r=g.items.find(it=>{const ni=normName(it.name);return ni===nx||ni.includes(nx)||nx.includes(ni)});
      if(r){
        if(x.margin!=null)r.margin=x.margin;
        r.pos={sales:x.ws||null,waste:x.ww||null,ai:x.ai||null};
        if(Array.isArray(x.ai)&&x.ai.some(v=>v)){
          const c=g.cur.v;c[r.id]=c[r.id]||{o:[null,null,null],i:[null,null,null],a:[null,null,null]};
          c[r.id].i=x.ai.map(v=>v||null)}
        upd++;
      }else if(x.new||addAll){
        const day=dayFromWeek(x.ws);
        if(day!=null)dayFilled++;
        const o={id:'i'+Date.now().toString(36)+Math.floor(Math.random()*1e4).toString(36),
          name:x.name,price:x.price?Math.round(x.price/1.08):0,day:day??0,unit:1,
          grade:x.new?'新':'○',my:0,tag:x.new?'新':'',
          memo:(x.new?'週次取込で自動追加':'写真取込で登録')+(day!=null?'／日販は週販売÷7の仮値':''),
          margin:x.margin??undefined,
          pos:{sales:x.ws||null,waste:x.ww||null,ai:x.ai||null}};
        g.items.push(o);added++;
      }else miss.push(x.name);
    });
    g.wk.tue=today;
    // その週の品目別スナップショットを蓄積（上書きせず履歴として残す）
    pushSnapshot(g,'tue',{items:d.items.map(x=>({name:x.name,price:x.price??null,
      margin:x.margin??null,ai:x.ai||null,ws:x.ws||null,ww:x.ww||null}))});
    msg.className='note ok';
    msg.textContent=`✓ ${g.name}：${upd}品を更新`+(added?`、${added}品を追加`:'')
      +(dayFilled?`（うち${dayFilled}品は日販を週販売÷7で仮入力。実態に合わせて商品設定で直してください）`:'')
      +(miss.length?`　※未登録のため飛ばした商品: ${miss.slice(0,5).join('、')}${miss.length>5?' 他':''}`
        +'（追加したい場合は「未登録の商品も追加する」にチェック）':'')
      +`　（${weekKey()}週として蓄積：計${(g.snap||[]).length}件）`;
  }else if(d.type==='new'&&Array.isArray(d.items)){
    /* 新商品案内明細：売価・原価・値入率・商品コードを取り込む。
       この画面の売価は税込、値入率は税込売価ベース（売価−原価÷売価） */
    const num=v=>(v==null||v==='')?null:Number(v);
    let upd=0,added=0;const bad=[];
    d.items.forEach(x=>{
      if(!x.name)return;
      const priceIn=num(x.price), cost=num(x.cost);
      let margin=num(x.margin);
      // 売価と原価から値入率を計算し直して、写真の値入率と食い違う行は知らせる
      if(priceIn&&cost!=null){
        const calc=Math.round((priceIn-cost)/priceIn*1000)/10;
        if(margin==null)margin=calc;
        else if(Math.abs(calc-margin)>0.5){bad.push(`${x.name}（値入率${margin}%だが売価と原価からは${calc}%）`);margin=calc}
      }
      const nx=normName(x.name);
      let r=g.items.find(it=>{const ni=normName(it.name);return ni===nx||ni.includes(nx)||nx.includes(ni)});
      const fields={};
      if(priceIn){fields.price=Math.round(priceIn/1.08);fields.priceIn=priceIn}   // アプリは税抜で持ち、税込も控える
      if(cost!=null)fields.cost=cost;
      if(margin!=null)fields.margin=margin;
      if(x.code)fields.code=String(x.code);
      if(num(x.unit)>0)fields.unit=num(x.unit);
      if(r){Object.assign(r,fields);upd++}
      else{
        g.items.push({id:'i'+Date.now().toString(36)+Math.floor(Math.random()*1e4).toString(36),
          name:x.name,day:0,grade:'新',my:0,tag:'新',
          memo:'新商品案内'+(x.start?` 発注開始${x.start}`:''),price:0,unit:1,...fields});
        added++;
      }
    });
    g.wk.newp=today;
    pushSnapshot(g,'new',{d:d.d||'',items:d.items});
    msg.className=bad.length?'note warn':'note ok';
    msg.textContent=(bad.length?'⚠ ':'✓ ')
      +`${g.name}：${added}品を追加、${upd}品を更新（売価・原価・値入率）`
      +(bad.length?`　※値入率が売価と原価から計算した値と違います：${bad.slice(0,3).join('、')}。売価と原価のほうを採用しました`:'');
  }else if(d.type==='rank'&&Array.isArray(d.items)){
    /* 売上ランキング：商品名・売価・期間の販売/廃棄を取り込む。
       この画面には値入率・納品数が無いため、それらは触らない */
    const num=v=>(v==null||v==='')?null:Number(v);
    const days=rankDays(d.from,d.upd);
    let upd=0,added=0,dayFilled=0;
    d.items.forEach(x=>{
      if(!x.name)return;
      const nx=normName(x.name);
      let r=g.items.find(it=>{const ni=normName(it.name);return ni===nx||ni.includes(nx)||nx.includes(ni)});
      const priceIn=num(x.price);
      const taxOut=priceIn?Math.round(priceIn/1.08):null;   // 画面は税込表示。アプリは税抜で持つ
      const rank={from:d.from||'',upd:d.upd||'',days,s:num(x.s),w:num(x.w)};
      if(r){
        if(!r.price&&taxOut){r.price=taxOut;r.priceIn=priceIn}   // すでに入っている売価は上書きしない
        if(x.code)r.code=String(x.code);
        r.rank=rank;
        if(!(r.day>0)&&rank.s!=null){r.day=Math.round(rank.s/days*10)/10;dayFilled++}
        upd++;
      }else{
        const day=rank.s==null?0:Math.round(rank.s/days*10)/10;
        if(day)dayFilled++;
        g.items.push({id:'i'+Date.now().toString(36)+Math.floor(Math.random()*1e4).toString(36),
          name:x.name,price:taxOut||0,priceIn:priceIn||undefined,day,unit:1,grade:'○',my:0,tag:'',
          code:x.code?String(x.code):undefined,
          memo:'売上ランキング取込'+(day?`／日販は${d.from||''}からの${days}日分`:''),
          rank});
        added++;
      }
    });
    g.wk.rank=today;
    pushSnapshot(g,'rank',{gen:d.gen||'',from:d.from||'',upd:d.upd||'',days,items:d.items});
    msg.className='note ok';
    msg.textContent=`✓ ${g.name}：${added}品を追加、${upd}品を更新`
      +(d.gen?`（${d.gen}）`:'')
      +`／販売・廃棄は${d.from||'対象期間'}からの${days}日分として記録`
      +(dayFilled?`、${dayFilled}品の日販を仮入力`:'')
      +'。値入率はこの画面に無いため、設定の「ジャンル既定の値入率」か商品ごとに入れてください';
  }else if(d.type==='mid'){
    // 中分類総数：現在庫・納品予定・便別繰越を、いま開いている発注日のデータとして取り込む
    const num=v=>(v==null||v==='')?null:Number(v);
    const stock=num(d.stock), plan=num(d.plan);
    if(stock==null&&plan==null&&!Array.isArray(d.carry)){
      msg.className='note crit';msg.textContent='現在庫・納品予定・繰越のどれも読み取れていません。写真を撮り直すか、数字を手入力してください。';return;
    }
    if(stock!=null)g.cur.carry=stock;
    if(plan!=null)g.cur.plan=plan;
    if(Array.isArray(d.carry))g.cur.carryBin=[0,1,2].map(i=>num(d.carry[i]));
    g.cur.stockSrc=`中分類総数${d.gen?'（'+d.gen+'）':''}${d.d?' '+d.d:''}`;
    // 小分類の「アイテム数」合計。アプリに登録した商品がジャンル全体を網羅しているかの目安にする
    const cnt=(Array.isArray(d.sub)?d.sub:[]).reduce((a,x)=>
      a+(Array.isArray(x.items)?x.items.reduce((b,y)=>b+(Number(y)||0),0):0),0);
    g.cur.stockItems=cnt||null;
    g.wk.mid=today;
    pushSnapshot(g,'mid',{gen:d.gen||'',d:d.d||'',stock,plan,carry:d.carry||null,sub:d.sub||null});
    // 小分類の合計と中分類の数字が合うか検算し、合わない場合は読み取り違いとして知らせる
    const sub=Array.isArray(d.sub)?d.sub:[];
    const sum=(k)=>sub.reduce((a,x)=>a+(num(x[k])||0),0);
    const warn=[];
    if(sub.length&&stock!=null&&sum('stock')!==stock)warn.push(`小分類の現在庫合計${sum('stock')}個が中分類${stock}個と合いません`);
    if(sub.length&&plan!=null&&sum('plan')!==plan)warn.push(`小分類の納品予定合計${sum('plan')}個が中分類${plan}個と合いません`);
    msg.className=warn.length?'note warn':'note ok';
    msg.textContent=(warn.length?'⚠ ':'✓ ')
      +`${g.name}に現在庫${stock??'—'}個・納品予定${plan??'—'}個を取り込みました`
      +(d.gen?`（中分類：${d.gen}）`:'')
      +(sub.length?`／小分類${sub.length}件を記録`:'')
      +(warn.length?`　※${warn.join('、')}。写真を確認してください`:'');
  }else{
    msg.className='note crit';msg.textContent='typeがmon/tue/mid/rank/newのどれでもありません。プロンプトをコピーし直して試してください。';return;
  }
  $('wkbox').value='';renderAll();autosave();
}
function renderWeekly(){
  const el=$('wklist');if(!el)return;el.textContent='';
  const g=G(),wk=g.wk||{};
  // どのジャンルに取り込むかを取り違えないよう、貼り付け前に必ず表示する
  const gen=$('wkGen');
  if(gen){gen.textContent=`取り込み先ジャンル：${g.icon||''} ${g.name||''}（${(g.items||[]).length}品）　違う場合は上のジャンルタブで切り替えてください`;
    gen.className=(g.items||[]).length?'note':'note warn'}
  const add=$('wkAddNew');
  if(add&&!add.dataset.touched)add.checked=!(g.items||[]).length;   // 商品ゼロのジャンルは初回登録として既定ON
  Object.entries(WK_TASKS).forEach(([k,t])=>{
    const w=document.createElement('div');w.className='row';
    const a=document.createElement('div');a.className='k';a.textContent=t.label;
    const b=document.createElement('div');b.className='v '+(wk[k]?'ok':'warn');
    b.textContent=(wk[k]?`✓ ${wk[k]} 取込済`:'未取込')+'　'+t.guide.replace('{gen}',g.name||'');
    w.append(a,b);el.appendChild(w)});
  // 蓄積状況（何週分たまっているか）
  const snap=g.snap||[];
  const weeks=[...new Set(snap.map(s=>s.week))];
  const readiness=forecastReadiness(g);
  const w=document.createElement('div');w.className='row';
  const a=document.createElement('div');a.className='k';a.textContent='蓄積データ';
  const b=document.createElement('div');b.className='v '+(readiness.ready?'ok':'warn');
  b.textContent=(readiness.ready?'✓ 発注予測に使用中':'予測に必要なデータが不足')
    +`　販売実績${readiness.hist}日／週次${readiness.weeks}週／商品データ${readiness.withDay}/${readiness.items}品`
    +(readiness.base?`　基準：${readiness.base.source}`:'');
  w.append(a,b);el.appendChild(w);
}

/* ---------- 入出力 ---------- */
function outPrompt(){
  const g=G(),s=sums('o'),ai=sums('i');
  const dv=($('dt').value||'').trim(), i=dowInfo(), k=tgtKey(), t=k?g.tgt[k]:null;
  const D=demand(), aiAdp=getAiAdoption(), sp=specialPeriod(dv);
  const ch=[];g.items.forEach(r=>{
    const a=vv(r.id,'o').reduce((x,y)=>x+(y||0),0),b=vv(r.id,'i').reduce((x,y)=>x+(y||0),0);
    if(Math.abs(a-b)>=2&&(a||b))ch.push(`${r.name}: 提案${a}個 → 実際の発注${b}個 (日販${r.day||0})`)});
  const h=g.hist.slice(-4).map(x=>`- ${x.d}(${x.w||'天気不明'}): 納品${x.n??'-'} / 販売${x.s??'-'} / 廃棄${x.ha??'-'} (消化率:${x.n&&x.s?(x.s/x.n*100).toFixed(0)+'%':'-'})${x.m?' ['+x.m+']':''}`);

  const p=[
    `【発注アドバイス依頼】`,
    `対象カテゴリ: ${g.name}`,
    `対象日: ${dv}${i?' ('+i.d+'曜・係数'+i.f.toFixed(2)+')':''}`,
    ...(sp?[`⚠ 特殊カレンダー: ${sp}期間（ストコンAIの学習対象外のため参考程度に）`]:[]),
    `提案の採用率: ${aiAdp?aiAdp.rate+'% ('+aiAdp.label+')':'未計算'}`,
    `本部目標: ${t?t.q+'個 / '+(t.a||0).toLocaleString()+'円':'未設定'}`,
    `需要見込み(提案数): ${D?D.q+'個 ('+D.src+')':'未設定'}`,
    ...((()=>{const aiT=['ai1','ai2','ai3'].reduce((a,id)=>a+(Number($(id).value)||0),0);
      return aiT?[`ストコンAI推奨合計(推奨値反映${$('aiver').value?'・'+$('aiver').value:''}): ${aiT}個（1便${$('ai1').value||0}/2便${$('ai2').value||0}/3便${$('ai3').value||0}）`]:[]})()),
    `提案合計: ${s.T}個 (${s.b.join('/')}) 納品金額: ${s.amt.toLocaleString()}円`,
    `\n## 直近の実績推移`,
    h.length?h.join('\n'):'実績データなし',
    `\n## 提案からの主な変更商品（±2個以上）`,
    ch.length?ch.join('\n'):'大きな変更なし',
    `\n## 相談内容`,
    `ファミマ発注マニュアルの「主力品への売場ボリューム集中」を踏まえ、上記の提案と実際の発注のバランスに機会ロスや過剰廃棄のリスクがないか評価・改善提案をお願いします。`
  ];
  $('out').value=p.join('\n');
}
function outCompact(){const g=G(),s=sums('o'),ai=sums('i'),ac=sums('a');
  const i=dowInfo(),k=tgtKey(),t=k?g.tgt[k]:null;
  const dv=($('dt').value||'').trim(), aiAdp=getAiAdoption();
  const L=[`#${g.name} ${dv}${(i&&!/[月火水木金土日]/.test(dv))?'('+i.d+')':''}`];
  if(t)L.push(`目標 ${t.q}個 ${t.a}円`);
  if(s.T)L.push(`提案 ${s.b.join('/')}=${s.T} ${s.amt}円`);
  if(ai.T)L.push(`実際の発注 ${ai.b.join('/')}=${ai.T}${aiAdp?' (採用率'+aiAdp.rate+'%)':''}`);
  if(ac.T)L.push(`実績 納品/販売/廃棄 ${ac.b.join('/')}`);
  const ch=[];g.items.forEach(r=>{const a=vv(r.id,'o').reduce((x,y)=>x+(y||0),0),
    b=vv(r.id,'i').reduce((x,y)=>x+(y||0),0);
    if(Math.abs(a-b)>=3&&(a||b))ch.push({n:r.name,d:a-b,t:`${r.name}${a}→${b}`})});
  ch.sort((x,y)=>Math.abs(y.d)-Math.abs(x.d));
  if(ch.length)L.push('提案比±3以上 '+ch.slice(0,8).map(x=>x.t).join(' ')+(ch.length>8?` 他${ch.length-8}品`:''));
  const h=g.hist.slice(-3).map(x=>`${x.d} 納${x.n??'-'} 販${x.s??'-'} 廃${x.ha??'-'}${x.w?' '+x.w:''}`);
  if(h.length)L.push('直近 '+h.join(' | '));
  $('out').value=L.join('\n')}
function outFull(){try{$('out').value=Storage.exportBackupText(DB)}catch(e){alert(e.message)}}
function copyOut(){const t=$('out');if(!t.value){outCompact()}t.select();
  const done=()=>flash('コピーしました');
  if(navigator.clipboard)navigator.clipboard.writeText(t.value).then(done).catch(()=>{document.execCommand('copy');done()});
  else{document.execCommand('copy');done()}}
function doImport(){try{const d=Storage.importBackupText($('impbox').value);DB=d;ensureCategories();save();$('dImp').close();$('impbox').value='';
    renderAll();flash('読み込みました')}catch(e){alert(e.message||'読み込めませんでした')}}

/* ---------- マウスドラッグで横スクロール（DeX等タッチ非対応環境向け） ---------- */
function enableDragScroll(el){
  let down=false,startX=0,startLeft=0,moved=false,pid=null;
  el.addEventListener('dragstart',e=>e.preventDefault());
  el.addEventListener('pointerdown',e=>{
    if(e.pointerType==='touch'){moved=false;return;}
    // タブや入力欄は横ドラッグよりクリック・フォーカスを優先する。
    if(e.target.closest('button,a,input,select,textarea')){moved=false;return;}
    down=true;moved=false;startX=e.clientX;startLeft=el.scrollLeft;pid=e.pointerId;
    try{el.setPointerCapture(pid)}catch(err){}
    el.classList.add('dragging');
    e.preventDefault()});
  el.addEventListener('pointermove',e=>{if(!down||e.pointerType==='touch')return;
    const dx=e.clientX-startX;if(Math.abs(dx)>3)moved=true;el.scrollLeft=startLeft-dx;
    e.preventDefault()});
  const end=()=>{if(!down)return;down=false;el.classList.remove('dragging');
    if(pid!=null){try{el.releasePointerCapture(pid)}catch(err){}}};
  el.addEventListener('pointerup',end);
  el.addEventListener('pointercancel',end);
  el.addEventListener('click',e=>{if(moved){e.preventDefault();e.stopPropagation();moved=false}},true);
}
function hscrollBy(id,dir){const el=$(id);if(!el)return;
  el.scrollBy({left:dir*160,behavior:'smooth'})}
document.querySelectorAll('.hscroll').forEach(enableDragScroll);

/* ---------- 起動 ---------- */
/* 日付欄は入力途中に現在データを上書きしない。
   入力確定時に、変更前の日付を下書き保存してから切り替える。 */
$('dt').addEventListener('input',()=>{applyDow();$('tq').value='';$('ta').value='';renderSetup()});
$('dt').addEventListener('change',()=>{
  const d=$('dt').value.trim();
  if(!orderDateParts(d)){
    $('dt').value=G().cur.dt||'';renderSetup();return;
  }
  if(d===G().cur.dt){renderSetup();return}
  saveOrderDateDraft();
  loadOrderDate(d);
});
$('wthr').addEventListener('input',()=>{
  G().cur.wthr=$('wthr').value;renderSetup();autosave()
});
/* 現在庫・納品予定は手入力もできる。写真取込で入った値もここに出る */
[['stk','carry'],['stkp','plan']].forEach(([id,key])=>{
  $(id).addEventListener('input',()=>{
    const v=$(id).value;
    G().cur[key]=v===''?null:Number(v);
    if(v!=='')G().cur.stockSrc='手入力';
    renderSetup();if(APP_TAB==='profit')renderProfit();autosave();
  });
});
['ai1','ai2','ai3'].forEach(id=>$(id).addEventListener('input',()=>{
  G().cur.ai=['ai1','ai2','ai3'].map(x=>$(x).value===''?null:Number($(x).value));
  // 配信版が未選択なら、入力時刻から最新版を自動で選ぶ
  if(!$('aiver').value){$('aiver').value=aiVersionNow().cur;G().cur.aiVer=$('aiver').value}
  renderSetup();autosave()}));
$('aiver').addEventListener('change',()=>{G().cur.aiVer=$('aiver').value;renderSetup();autosave()});
['h_n1','h_n2','h_n3','h_s1','h_s2','h_s3','h_ha1','h_ha2','h_ha3'].forEach(id=>$(id).addEventListener('input',()=>{
  updateHistTotals();saveHistDateDraft();
}));
BOOT_HAD_LOCAL_DB=load();
if(!BOOT_HAD_LOCAL_DB)DB=fresh();
if(!DB.g)DB=fresh();
/* 保存データが空(商品0件かつ履歴0件)なら初期データから復旧する。
   キャッシュ削除などでデータが失われても商品マスタが戻るようにする */
(function reseedIfEmpty(){
  const items=Object.values(DB.g||{}).reduce((a,g)=>a+((g.items||[]).length),0);
  const hist=Object.values(DB.g||{}).reduce((a,g)=>a+((g.hist||[]).length),0);
  if(items===0&&hist===0)DB=fresh();
})();
ensureCategories();
// 保存されているジャンルをそのまま開く。未設定・不明なジャンルのときだけおむすびに戻す。
if(!DB.active||!DB.g[DB.active])DB.active='onigiri';
cleanMemoDisplayTest();
applyPhotoActualFix();
applyGenreBinDefaults();
initDriveImport();
renderWeeklySample($('wkAiType')?.value||'mon');
renderAll();save({dirty:false,now:DB.ts||Date.now()});
if(STORAGE_WARNING)setTimeout(()=>alert(STORAGE_WARNING),0);
cloudLoadSilent();

/* 画面離脱・バックグラウンド移行時の保存漏れ防止。
   クラウド送信ではなく、まず端末の最新状態を同期的に保存する。 */
function saveBeforeLeave(){saveOrderDateDraft();if($('dHist')&&$('dHist').open)saveHistDateDraft();save()}
window.addEventListener('pagehide',saveBeforeLeave);
window.addEventListener('beforeunload',saveBeforeLeave);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')saveBeforeLeave()});
