/**
 * VU Event → Google Sheet (Apps Script web app)
 *
 * Every event becomes a NEW TAB inside one spreadsheet (the template spreadsheet itself).
 * The template tab is never modified — each event tab is a copy of it.
 *
 * Setup (once):
 *  1. Script properties:
 *       TEMPLATE_ID  = id of the spreadsheet (the part between /d/ and /edit in its URL).
 *                      Not hardcoded here because this repo is public.
 *       TOKEN        = long random secret (same value as APPS_SCRIPT_TOKEN in the backend .env).
 *       TEMPLATE_TAB = (optional) name of the template tab; default = first tab.
 *  2. Deploy → Manage deployments → edit → New version → Execute as: Me, Who has access: Anyone.
 *
 * The backend sends only the DB-driven cells. On reload (sheet_id = tab gid) only those cells
 * are rewritten, so unit costs / notes / status / invoice typed by hand are never touched.
 */

function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents);
    var token = PropertiesService.getScriptProperties().getProperty('TOKEN');
    if (token && req.token !== token) return out_({ ok: false, error: 'unauthorized' });
    if (req.action !== 'upsert') return out_({ ok: false, error: 'unknown action' });

    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var ss = openSS_();
      var created = false, sh = null;
      if (req.sheet_id) {
        var sheets = ss.getSheets();
        for (var k = 0; k < sheets.length; k++) {
          if (String(sheets[k].getSheetId()) === String(req.sheet_id)) { sh = sheets[k]; break; }
        }
      }
      if (!sh) { sh = createTab_(ss, req.event_name); created = true; }  // also when the tab was deleted by hand
      fill_(ss, sh, req);
      SpreadsheetApp.flush();
      return out_({ ok: true, created: created, sheet_id: String(sh.getSheetId()), url: ss.getUrl().replace(/#.*$/, '') + '#gid=' + sh.getSheetId() });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet(e) {
  // ?diag=1 → reports whether Drive/template access works for the deployed web app (no data is changed)
  if (e && e.parameter && e.parameter.diag) {
    try {
      var ss = openSS_();
      return out_({ ok: true, spreadsheet: ss.getName(), tabs: ss.getSheets().length, user: Session.getEffectiveUser().getEmail() });
    } catch (err) {
      return out_({ ok: false, error: String(err && err.message || err) });
    }
  }
  return out_({ ok: true, service: 'vu-event-sheet' });
}

// Run this once from the editor to force Google's permission prompt.
function authorize() { Logger.log(openSS_().getName()); }

function openSS_() {
  var id = PropertiesService.getScriptProperties().getProperty('TEMPLATE_ID');
  if (!id) throw new Error('TEMPLATE_ID script property is not set');
  return SpreadsheetApp.openById(id);
}

// Tab names: unique, max 100 chars, no [ ] * ? : / \
function uniqueTabName_(ss, name, selfSheet) {
  var base = String(name || 'Event').replace(/[\[\]*?:\/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) || 'Event';
  var cand = base, n = 2;
  for (;;) {
    var ex = ss.getSheetByName(cand);
    if (!ex || (selfSheet && ex.getSheetId() === selfSheet.getSheetId())) return cand;
    cand = base + ' (' + (n++) + ')';
  }
}

function createTab_(ss, name) {
  var tabName = PropertiesService.getScriptProperties().getProperty('TEMPLATE_TAB');
  var tpl = (tabName && ss.getSheetByName(tabName)) || ss.getSheets()[0];
  var sh = tpl.copyTo(ss);
  sh.setName(uniqueTabName_(ss, name, sh));
  // The template holds sample data (unit costs, totals, status, notes…). A new event starts empty:
  // only the DB-driven cells are filled by fill_(); everything else is typed by hand later.
  ['A2:B2', 'D2:K10', 'C13:K14', 'C15:K16'].forEach(function (a) { sh.getRange(a).clearContent(); });
  sh.showSheet();
  ss.setActiveSheet(sh);
  ss.moveActiveSheet(ss.getNumSheets());
  return sh;
}

function fill_(ss, sh, req) {
  var wanted = uniqueTabName_(ss, req.event_name, sh);
  if (sh.getName() !== wanted) sh.setName(wanted);

  clearMarkerFill_(sh);  // the red cells in the template only mark "filled by the system"

  sh.getRange('A2').setValue(req.event_name);   // EVENT (merged A2:A10)
  sh.getRange('B2').setValue(req.date);         // DATE  (merged B2:B10)

  // COUNT column: find each item row by its label in column C (rows 2..10), so moving rows is safe.
  var labels = sh.getRange(2, 3, 9, 1).getValues();
  Object.keys(req.counts || {}).forEach(function (item) {
    for (var i = 0; i < labels.length; i++) {
      if (String(labels[i][0]).trim().toLowerCase() === item.toLowerCase()) {
        sh.getRange(2 + i, 6).setValue(req.counts[item]);
        break;
      }
    }
  });

  // Summary block: the row under the "LOCATION" header (C / E / H / J).
  var hdr = sh.getRange(1, 3, 30, 1).getValues();
  var r = -1;
  for (var j = 0; j < hdr.length; j++) if (String(hdr[j][0]).trim().toUpperCase() === 'LOCATION') { r = j + 1; break; }
  if (r > 0) {
    var s = req.summary || {};
    sh.getRange(r + 1, 3).setValue(s.location || '');
    sh.getRange(r + 1, 5).setValue(s.bottle_sampled || 0);
    sh.getRange(r + 1, 8).setValue(s.duration_days || 1);
    sh.getRange(r + 1, 10).setNumberFormat('@').setValue(s.time || '');
  }
}

// Red (#ea9999) background → white, on this event tab only (the template tab keeps its markers).
function clearMarkerFill_(sh) {
  var rng = sh.getRange(1, 1, 20, 11), bg = rng.getBackgrounds(), changed = false;
  for (var i = 0; i < bg.length; i++) for (var j = 0; j < bg[i].length; j++) {
    if (String(bg[i][j]).toLowerCase() === '#ea9999') { bg[i][j] = '#ffffff'; changed = true; }
  }
  if (changed) rng.setBackgrounds(bg);
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
