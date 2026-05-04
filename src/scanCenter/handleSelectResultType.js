import { fetchScanResults } from '../scans/fetchScanResults.js';
import { fetchAdvancedScanResults } from '../scans/fetchAdvancedScanResults.js';
import { fetchDismissedAlerts } from '../scans/fetchDismissedAlerts.js';

export async function handleSelectResultType({ STEPS, item, selectedRepo, selectedScan, setSelectedResultType, setStep, setLoadingMsg, setError, setResults, filterDismissed = false, includeFalsePositives = true }) {
  const rt = item.value;
  setSelectedResultType(rt);
  setStep(STEPS.LOADING);
  setLoadingMsg(`Fetching ${item.label}…`);

  const repo = selectedRepo.full_name;
  const commitId = selectedScan.commitId;
  const fetchOpts = { filterDismissed, includeFalsePositives };
  let res;

  if (rt.kind === 'basic') {
    res = await fetchScanResults(repo, commitId, rt.value, fetchOpts);
  } else if (rt.kind === 'advanced') {
    res = await fetchAdvancedScanResults(repo, commitId, rt.value, fetchOpts);
  } else if (rt.value === 'dismissed_alerts') {
    const r = await fetchDismissedAlerts(repo, 'security');
    res = r.success ? { success: true, issues: r.dismissedAlerts } : r;
  } else if (rt.value === 'dismissed_secrets') {
    const r = await fetchDismissedAlerts(repo, 'secrets');
    res = r.success ? { success: true, issues: r.dismissedAlerts } : r;
  }

  if (!res || !res.success) {
    setError((res && res.error) || 'Failed to fetch results', STEPS.SELECT_RESULT_TYPE);
    return;
  }

  setResults(res);
  setStep(STEPS.SHOWING_RESULTS);
}
