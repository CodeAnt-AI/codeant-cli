import { getScanHistory } from '../scans/getScanHistory.js';

export async function handleSelectRepo({ STEPS, item, setSelectedRepo, setStep, setLoadingMsg, setError, setScanHistory }) {
  setSelectedRepo(item.value);
  setStep(STEPS.LOADING);
  const repoFullName = item.value.full_name || item.value.name;
  setLoadingMsg(`Loading scan history for ${repoFullName}…`);
  const res = await getScanHistory(repoFullName);
  if (!res.success) {
    setError(res.error || 'Failed to fetch scan history', STEPS.SELECT_REPO);
    return;
  }
  const history = res.scanHistory || [];
  if (process.env.CODEANT_DEBUG_SCAN_HISTORY === '1') {
    process.stderr.write('SCAN_HISTORY_SAMPLE: ' + JSON.stringify(history.slice(0, 15), null, 2) + '\n');
  }
  setScanHistory(history);
  setStep(STEPS.SELECT_SCAN);
}
