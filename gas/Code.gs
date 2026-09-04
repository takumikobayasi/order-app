const FILE_NAME = "hacchu_cloud_db.json";
const UPLOAD_ROOT_NAME = "発注アプリ資料";

const UPLOAD_CATEGORIES = {
  mon_timeseries: "月曜・時系列グラフ",
  tue_assortment: "火曜・品揃え",
  waste: "廃棄集計",
  order_progress: "発注進捗",
  unclassified: "未分類"
};

function doGet(e) {
  const cb = e && e.parameter ? e.parameter.callback : null;
  const mode = e && e.parameter ? e.parameter.mode : null;
  if (mode === "catalog") return catalogResponse_(e, cb);
  let content = "{}";

  const files = DriveApp.getFilesByName(FILE_NAME);
  if (files.hasNext()) content = files.next().getBlob().getDataAsString();

  if (cb) {
    return ContentService.createTextOutput(cb + "(" + content + ")")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(content)
    .setMimeType(ContentService.MimeType.JSON);
}

function catalogResponse_(e, cb) {
  try {
    const expected = PropertiesService.getScriptProperties().getProperty("CATALOG_ACCESS_TOKEN");
    const actual = e && e.parameter ? String(e.parameter.token || "") : "";
    if (!expected || actual !== expected) return jsonpResponse_({ok:false,error:"アクセスキーが違います"}, cb);

    const path = e && e.parameter ? String(e.parameter.path || "") : "";
    const parts = path.split("/").filter(Boolean);
    if (parts.length < 2 || parts[0] !== UPLOAD_ROOT_NAME || parts.some(x => x === "." || x === "..") || !/\.json$/i.test(parts[parts.length - 1])) {
      return jsonpResponse_({ok:false,error:"読取パスが正しくありません"}, cb);
    }
    let folder = DriveApp.getRootFolder();
    for (let i = 0; i < parts.length - 1; i++) {
      const folders = folder.getFoldersByName(parts[i]);
      if (!folders.hasNext()) return jsonpResponse_({ok:false,error:"フォルダが見つかりません"}, cb);
      folder = folders.next();
    }
    const files = folder.getFilesByName(parts[parts.length - 1]);
    if (!files.hasNext()) return jsonpResponse_({ok:false,error:"商品データが見つかりません"}, cb);
    const data = JSON.parse(files.next().getBlob().getDataAsString("UTF-8"));
    return jsonpResponse_(data, cb);
  } catch (err) {
    return jsonpResponse_({ok:false,error:"商品データを読み込めませんでした"}, cb);
  }
}

function jsonpResponse_(value, cb) {
  const json = JSON.stringify(value);
  if (cb && /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(cb)) {
    return ContentService.createTextOutput(cb + "(" + json + ")").setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const raw = e && e.postData ? e.postData.contents : "";
    let body = null;
    try { body = JSON.parse(raw); } catch (_) {}

    if (body && body.mode === "upload") return uploadFile_(body);

    // 既存の発注DB同期
    const files = DriveApp.getFilesByName(FILE_NAME);
    if (files.hasNext()) files.next().setContent(raw);
    else DriveApp.createFile(FILE_NAME, raw, MimeType.PLAIN_TEXT);
    return textResponse_("OK");
  } catch (err) {
    return textResponse_("ERR: " + err.message);
  }
}

function uploadFile_(body) {
  if (!/^\d{4}-\d{2}$/.test(String(body.month || ""))) {
    return textResponse_(JSON.stringify({ok:false,error:"month"}));
  }
  if (!body.data || !body.name) {
    return textResponse_(JSON.stringify({ok:false,error:"file"}));
  }
  const category = UPLOAD_CATEGORIES[body.category] || UPLOAD_CATEGORIES.unclassified;
  const root = getOrCreateFolder_(DriveApp.getRootFolder(), UPLOAD_ROOT_NAME);
  const month = getOrCreateFolder_(root, String(body.month));
  const folder = getOrCreateFolder_(month, category);
  const name = safeName_(String(body.name));
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Asia/Tokyo", "yyyyMMdd_HHmmss");
  const blob = Utilities.newBlob(Utilities.base64Decode(String(body.data)), body.mimeType || "application/octet-stream", stamp + "_" + name);
  const file = folder.createFile(blob);
  return textResponse_(JSON.stringify({ok:true,id:file.getId(),name:file.getName()}));
}

function getOrCreateFolder_(parent, name) {
  const folders = parent.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parent.createFolder(name);
}

function safeName_(name) {
  return name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 150) || "uploaded_file";
}

function textResponse_(value) {
  return ContentService.createTextOutput(value).setMimeType(ContentService.MimeType.TEXT);
}
