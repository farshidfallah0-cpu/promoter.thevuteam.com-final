// Field types that get their own dedicated UI/logic elsewhere and shouldn't
// also be counted as a generic "fill this in" report field.
const SPECIAL_TYPES = ['advanced_checklist', 'team_directory', 'brief_reader', 'camera_checkin', 'camera_checkout', 'photos', 'sampling_counter', 'bvt_cigarette_match', 'bvt_sampling_report', 'mehram_supermarket_report'];

export function calcReportProgress(reportFields, formData) {
  const items = [];
  reportFields.forEach(f => {
    if (f.required === false) return;
    const title = f.title || f.label || 'تکمیل فیلد فرم';
    if (f.type === 'daily_report') {
      items.push({ done: !!(formData[`${f.id}_summary`] && String(formData[`${f.id}_summary`]).trim()), title: 'خلاصه عملکرد روزانه' });
    } else if (f.type === 'sampling_counter') {
      items.push({ done: Number(formData[f.id]) > 0, title });
    } else {
      const v = formData[f.id];
      items.push({ done: v !== undefined && v !== null && v !== '' && (!Array.isArray(v) || v.length > 0), title });
    }
  });
  return items;
}

// The same "how much of today's work is actually done" metric that powers
// CrewEventTab's own hero progress bar (report fields, check-in, briefing,
// role-visible checklist items, photos, sampling where relevant) — pulled out
// here so admin-side views (ReportsTab's per-submission card, the dashboard
// team list) can show a promoter's real completion percentage instead of a
// raw report count, without re-deriving this field-by-field logic per view.
//
// `userRole` is the already-resolved role string for the day this formData
// belongs to (checklist item visibility/edit permissions are per-role) —
// callers each already have a correct way to get it (resolveEffectiveRole in
// the crew app, ReportsTab's own day-matched getPromoterRole, etc.), so this
// takes the resolved value rather than a `user` object + re-resolving it
// with a second, potentially inconsistent day-matching path.
export function calcGlobalProgress(event, formData, userRole) {
  const data = formData || {};
  const fields = event?.fields || [];
  const manualFields = fields.filter(f => !f.autoFill);
  const reportFields = manualFields.filter(f => !SPECIAL_TYPES.includes(f.type));
  const checklistField = manualFields.find(f => f.type === 'advanced_checklist');
  const briefField = manualFields.find(f => f.type === 'brief_reader');
  const checkinField = manualFields.find(f => f.type === 'camera_checkin');
  const photosField = manualFields.find(f => f.type === 'photos');
  const samplingField = manualFields.find(f => f.type === 'sampling_counter');
  const bvtSamplingField = manualFields.find(f => f.type === 'bvt_sampling_report');
  const mehramField = manualFields.find(f => f.type === 'mehram_supermarket_report');

  const checkinVal = checkinField ? data[checkinField.id] : null;
  const checkinDone = Array.isArray(checkinVal) ? checkinVal.length > 0 : !!checkinVal;
  const briefRead = briefField ? !!data[`${briefField.id}_read`] : false;
  const photosVal = photosField ? data[photosField.id] : null;
  const photosDone = Array.isArray(photosVal) ? photosVal.length > 0 : (photosVal !== undefined && photosVal !== null && photosVal !== '');
  const samplingDone = samplingField ? Number(data[samplingField.id]) > 0 : false;
  const bvtSamplingDone = bvtSamplingField ? Number(data[bvtSamplingField.id]) > 0 : false;
  const mehramDone = mehramField ? Number(data[mehramField.id]) > 0 : false;

  const allChecklistItems = checklistField ? (checklistField.checklistItems || []) : [];
  const checklistKey = checklistField ? `${checklistField.id}_checklist` : '_crew_checklist';
  const checklistState = data[checklistKey] || {};
  const editableChecklistItems = allChecklistItems
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => {
      if (typeof item === 'string') return true;
      const perm = item.permissions ? item.permissions[userRole] : (item.role === userRole ? 'edit' : 'view');
      return perm === 'edit';
    });

  const items = [...calcReportProgress(reportFields, data)];
  if (checkinField) items.push({ done: checkinDone, title: 'ثبت حضور (ورود)' });
  if (briefField) items.push({ done: briefRead, title: 'مطالعه بریفینگ' });
  editableChecklistItems.forEach(({ item, idx }) => items.push({ done: !!checklistState[idx], title: typeof item === 'string' ? item : item.title }));
  if (photosField && photosField.required !== false) items.push({ done: photosDone, title: photosField.title || 'تصاویر چیدمان' });
  if (bvtSamplingField && bvtSamplingField.required !== false) items.push({ done: bvtSamplingDone, title: bvtSamplingField.title || 'گزارش سمپلینگ BVT' });
  if (mehramField && mehramField.required !== false) items.push({ done: mehramDone, title: mehramField.title || 'گزارش سوپرمارکت' });
  if (samplingField && samplingField.required !== false && userRole !== 'promoter') items.push({ done: samplingDone, title: samplingField.title || 'تعداد سمپلینگ' });

  const done = items.filter(i => i.done).length;
  const total = items.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 100;
  return { done, total, pct, items };
}
