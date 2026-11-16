// Google Apps Script Web App untuk WHOOPS! Photobooth
// Pasang di https://script.google.com menggunakan akun Google Drive studio.

var SCRIPT_SECRET = ''; // Opsional: isi kunci rahasia jika ingin membatasi akses (samakan dengan Admin Dashboard)
var DEFAULT_ROOT_FOLDER_ID = ''; // Opsional: ID atau URL folder induk Google Drive untuk menampung semua folder pesanan

function jsonOutput(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function extractFolderId(rawValue) {
  var val = (rawValue || '').toString().trim();
  if (!val) return '';
  var folderMatch = val.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch && folderMatch[1]) return folderMatch[1];
  var idMatch = val.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch && idMatch[1]) return idMatch[1];
  return val;
}

function getOrResolveTargetParent(rootFolderId) {
  var id = extractFolderId(rootFolderId) || extractFolderId(DEFAULT_ROOT_FOLDER_ID);
  if (!id) return DriveApp.getRootFolder();

  try {
    var folder = DriveApp.getFolderById(id);
    if (folder.isTrashed()) {
      throw new Error('Folder induk Google Drive berada di Sampah (Trash).');
    }
    return folder;
  } catch (err) {
    throw new Error(
      'Folder induk Google Drive (ID: ' +
        id +
        ') tidak ditemukan atau belum dapat diakses oleh akun Google Apps Script ini.'
    );
  }
}

function countActiveFiles(folder) {
  var count = 0;
  var it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (!f.isTrashed()) count++;
  }
  return count;
}

function doGet() {
  return jsonOutput({
    ok: true,
    service: 'WHOOPS! Photobooth Google Drive Uploader',
    version: '2.0.0',
    hasSecret: Boolean(SCRIPT_SECRET),
    hasDefaultRootFolder: Boolean(extractFolderId(DEFAULT_ROOT_FOLDER_ID)),
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
        folderId: parentCheck.getId(),
        folderName: parentCheck.getName(),
      });
    }

    var orderCode = (body.orderCode || 'WHP-ORDER').toString().replace(/[^a-zA-Z0-9_-]/g, '');
    var folder = null;
    var requestedFolderId = extractFolderId(body.folderId);

    if (requestedFolderId) {
      try {
        var candidate = DriveApp.getFolderById(requestedFolderId);
        if (candidate && !candidate.isTrashed()) {
          folder = candidate;
        }
      } catch (err) {
        folder = null;
      }
    }

    var sharingWarning = '';
    if (!folder) {
      var parent = getOrResolveTargetParent(body.rootFolderId);
      var dateStamp = Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone() || 'Asia/Jakarta',
        'yyyy-MM-dd_HHmm'
      );
      var folderName = 'WHOOPS_' + dateStamp + '_' + orderCode;
      folder = parent.createFolder(folderName);
      try {
        folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (shareErr) {
        sharingWarning =
          'Folder berhasil dibuat, tetapi izin link publik dibatasi oleh kebijakan akun Google ini.';
      }
    }

    var replaceExisting = body.replaceExisting !== false;
    var files = Array.isArray(body.files) ? body.files : [];
    var uploadedCount = 0;

    for (var i = 0; i < files.length; i++) {
      var item = files[i];
      if (!item || !item.base64) continue;
      var filename = (item.filename || ('WHOOPS-' + (i + 1) + '.png')).toString();

      if (replaceExisting) {
        var existingFiles = folder.getFilesByName(filename);
        while (existingFiles.hasNext()) {
          existingFiles.next().setTrashed(true);
        }
      }

      var bytes = Utilities.base64Decode(item.base64);
      var blob = Utilities.newBlob(
        bytes,
        item.mimeType || 'image/png',
        filename
      );
      folder.createFile(blob);
      uploadedCount++;
    }

    return jsonOutput({
      ok: true,
      folderId: folder.getId(),
      folderUrl: folder.getUrl(),
      fileCount: uploadedCount,
      totalFiles: countActiveFiles(folder),
      sharingWarning: sharingWarning,
    });
  } catch (err) {
    return jsonOutput({
      ok: false,
      error: err && err.message ? err.message : String(err),
    });
  }
}
