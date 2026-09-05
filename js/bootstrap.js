import * as storage from './modules/storage.js';

// 移行期間中は既存app.jsをクラシックスクリプトとして起動する。
// これによりHTMLの既存onclickを壊さず、モジュールを段階導入できる。
window.HacchuStorage = storage;
storage.preserveRecoveryCandidate();

const app = document.createElement('script');
app.src = './app.js?v=2026090504';
app.onload = () => {
  const guide = document.createElement('script');
  guide.src = './js/weekly-sample-guide.js?v=2026090502';
  guide.onload = () => {
    const select = document.getElementById('wkAiType');
    if (select && window.renderWeeklySample) window.renderWeeklySample(select.value);
  };
  document.body.appendChild(guide);
};
app.onerror = () => {
  const status = document.getElementById('st');
  if (status) status.textContent = 'アプリ読込エラー';
};
document.body.appendChild(app);
