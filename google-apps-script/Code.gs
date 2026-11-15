// Google Apps Script Web App untuk WHOOPS! Photobooth
// Pasang di https://script.google.com menggunakan akun Google Drive studio.

var SCRIPT_SECRET = ''; // Opsional: isi kunci rahasia jika ingin membatasi akses (samakan dengan Admin Dashboard)
var DEFAULT_ROOT_FOLDER_ID = ''; // Opsional: ID folder induk Google Drive untuk menampung semua folder pesanan

function jsonOutput(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrResolveTargetParent(rootFolderId) {
  var id = (rootFolderId || DEFAULT_ROOT_FOLDER_ID || '').trim();
  if (!id) return DriveApp.getRootFolder();
  return DriveApp.getFolderById(id);
}

function doGet() {
  return jsonOutput({
    ok: true,
    service: 'WHOOPS! Photobooth Google Drive Uploader',
    timestamp: new Date().toISOString(),
  });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonOutput({ ok: false, error: 'Payload kosong.' });
    }

    var body = JSON.parse(e.postData.contents);
    if (SCRIPT_SECRET && body.secret !== SCRIPT_SECRET) {
      return jsonOutput({ ok: false, error: 'Secret key tidak cocok.' });
    }

    var action = body.action || 'upload_order';

    if (action === 'ping') {
      var parentCheck = getOrResolveTargetParent(body.rootFolderId);
      return jsonOutput({
        ok: true,
        message: 'Terhubung ke Google Drive folder: ' + parentCheck.getName(),
      });
    }

    var orderCode = (body.orderCode || 'WHP-ORDER').toString().replace(/[^a-zA-Z0-9_-]/g, '');
    var folder = null;

    if (body.folderId) {
      try {
        folder = DriveApp.getFolderById(body.folderId);
      } catch (err) {
        folder = null;
      }
    }

    if (!folder) {
      var parent = getOrResolveTargetParent(body.rootFolderId);
      var dateStamp = Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone() || 'Asia/Jakarta',
        'yyyy-MM-dd_HHmm'
      );
      var folderName = 'WHOOPS_' + dateStamp + '_' + orderCode;
      folder = parent.createFolder(folderName);
      folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    }

    var files = Array.isArray(body.files) ? body.files : [];
    var uploadedCount = 0;

    for (var i = 0; i < files.length; i++) {
      var item = files[i];
      if (!item || !item.base64) continue;
      var bytes = Utilities.base64Decode(item.base64);
      var blob = Utilities.newBlob(
        bytes,
        item.mimeType || 'image/png',
        item.filename || ('WHOOPS-' + (i + 1) + '.png')
      );
      folder.createFile(blob);
      uploadedCount++;
    }

    return jsonOutput({
      ok: true,
      folderId: folder.getId(),
      folderUrl: folder.getUrl(),
      fileCount: uploadedCount,
    });
  } catch (err) {
    return jsonOutput({
      ok: false,
      error: err && err.message ? err.message : String(err),
    });
  }
}
