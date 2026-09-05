(function(){
  const guides={
    mon:{title:'月曜：日別時系列推移グラフ',press:'①「数量」を押す',check:'② 中分類名・対象期間を見る',capture:'③ AI推奨・納品・販売・廃棄を撮る',cols:['日付','AI推奨','納品','販売','廃棄'],rows:[['8/24','134','134','126','14'],['8/25','128','130','121','9']],note:'中分類名と日付が見える状態で、数量表示を撮影します。前年実績は下へスクロールしてもう1枚撮ります。'},
    tue:{title:'火曜：品揃え状況確認・修正',press:'①「数量」を押す',check:'② 中分類名を見る',capture:'③ 商品名から粗利額まで全ページ撮る',cols:['商品名','売価','値入率','AI推奨','週販売／廃棄'],rows:[['商品A','198','40.4%','4／2／0','40／2'],['商品B','238','38.0%','3／1／0','32／1']],note:'商品名から販売・廃棄まで見えるように撮影し、下へスクロールして全商品を撮ります。'},
    mid:{title:'発注前：中分類総数（上下2枚）',press:'①「中分類総数」を押す',check:'② 発注日・中分類・直近日別を見る',capture:'③ 上側1枚＋下へスクロールして1枚',cols:['見る場所','繰越','納品','販売','廃棄','右側'],rows:[['中分類計','便別','便別','便別','便別','現在庫・納品予定'],['小分類','便別','便別','便別','便別','アイテム数']],note:'最初に中分類全体と上側の小分類を撮り、下へスクロールして残りの小分類をもう1枚撮ります。発注日、中分類名、現在庫、納品予定、アイテム数が切れないようにします。'},
    rank:{title:'商品登録：売上ランキング',press:'①「売上ランキング」を押す',check:'②「数量」「自店」を押す',capture:'③ 商品名・コード・売価・販売・廃棄を撮る',cols:['商品名','商品コード','売価','販売','廃棄'],rows:[['商品A','19401450','334','7','0'],['商品B','19401451','298','5','1']],note:'対象期間と更新日時も入れて、数量表示を撮影します。必要に応じて金額表示も撮ります。'},
    newp:{title:'新商品：新商品案内明細',press:'① 新商品案内明細を開く',check:'② 日付・発注開始日を見る',capture:'③ 売価・原価・値入率・コードを撮る',cols:['商品名','売価','原価','値入率','商品コード','入数'],rows:[['新商品A','198','125.25','36.7%','0410113','1'],['新商品B','248','156.24','37.0%','0410114','1']],note:'日付と発注開始日を含め、画面にある商品をすべて撮影します。'}
  };
  const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  window.renderWeeklySample=function(type){
    const s=guides[type]||guides.mon,W=720,H=330,left=18,top=142,rowH=48,colW=(W-left*2)/s.cols.length;
    let cells='';
    s.cols.forEach((v,i)=>{cells+=`<rect x="${left+i*colW}" y="${top}" width="${colW}" height="36" fill="#e8eef8" stroke="#9aa9bd"/><text x="${left+i*colW+colW/2}" y="${top+23}" text-anchor="middle" font-size="13" font-weight="700" fill="#26364a">${esc(v)}</text>`});
    s.rows.forEach((row,r)=>row.forEach((v,i)=>{const y=top+36+r*rowH;cells+=`<rect x="${left+i*colW}" y="${y}" width="${colW}" height="${rowH}" fill="white" stroke="#c7d0dc"/><text x="${left+i*colW+colW/2}" y="${y+29}" text-anchor="middle" font-size="13" fill="#26364a">${esc(v)}</text>`}));
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" rx="14" fill="#f4f7fb"/><rect x="12" y="12" width="696" height="44" rx="7" fill="#1e4f91"/><text x="28" y="40" font-family="sans-serif" font-size="18" font-weight="700" fill="white">ストコン画面例　${esc(s.title)}</text><rect x="18" y="68" width="215" height="54" rx="9" fill="#fff3cd" stroke="#f59e0b" stroke-width="2"/><rect x="252" y="68" width="215" height="54" rx="9" fill="#e8f4ff" stroke="#1684d6" stroke-width="2"/><rect x="486" y="68" width="216" height="54" rx="9" fill="#eaf8ee" stroke="#20a052" stroke-width="2"/><text x="30" y="90" font-family="sans-serif" font-size="14" font-weight="700" fill="#8a5200">${esc(s.press)}</text><text x="264" y="90" font-family="sans-serif" font-size="14" font-weight="700" fill="#075c9e">${esc(s.check)}</text><text x="498" y="90" font-family="sans-serif" font-size="14" font-weight="700" fill="#126b35">${esc(s.capture)}</text><text x="30" y="111" font-family="sans-serif" font-size="12" fill="#654000">ここを押す</text><text x="264" y="111" font-family="sans-serif" font-size="12" fill="#075c9e">ここを見る</text><text x="498" y="111" font-family="sans-serif" font-size="12" fill="#126b35">この範囲を撮る</text>${cells}<rect x="10" y="134" width="700" height="144" rx="8" fill="none" stroke="#ef4444" stroke-width="5" stroke-dasharray="10 6"/><text x="700" y="306" text-anchor="end" font-family="sans-serif" font-size="13" font-weight="700" fill="#c92a2a">赤枠が全部入るように撮影</text></svg>`;
    document.getElementById('wkSampleTitle').textContent=s.title+' の撮影例';
    document.getElementById('wkSampleImg').src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
    document.getElementById('wkSampleImg').alt=s.title+'で写真に含める項目のサンプル';
    document.getElementById('wkSampleNote').textContent=s.note+' ※実際の店舗情報・商品データは表示していません。';
  };
})();
