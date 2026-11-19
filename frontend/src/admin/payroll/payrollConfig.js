// «محاسبه عملکرد»: the header link is always there for the event managers; its content and the
// «تایید روز کاری» strip on report cards stay hidden until the owner switches this on.
export const PAYROLL_ENABLED = true;

// Mehram is paid outside our system, so its events never take part in payroll.
const EXCLUDED_CLIENTS = new Set(['mahram', 'mehram', 'مهرام']);
export const isPayrollEvent = (ev) => !!ev
  && !EXCLUDED_CLIENTS.has(String(ev.client_name || '').trim().toLowerCase())
  && !(ev.fields || []).some((f) => f?.type === 'mehram_supermarket_report');
