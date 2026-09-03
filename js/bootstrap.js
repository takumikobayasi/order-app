import * as storage from './modules/storage.js';

// 移行期間中は既存app.jsをクラシックスクリプトとして起動する。
// これによりHTMLの既存onclickを壊さず、モジュールを段階導入できる。
window.HacchuStorage = storage;
storage.preserveRecoveryCandidate();

const app = document.createElement('script');
app.src = './app.js?v=2026090303';
app.onerror = () => {
  const status = document.getElementById('st');
  if (status) status.textContent = 'アプリ読込エラー';
};
document.body.appendChild(app);
