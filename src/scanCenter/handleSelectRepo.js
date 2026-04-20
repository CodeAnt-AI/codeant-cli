import { getScanHistory } from '../scans/getScanHistory.js';

export async function handleSelectRepo({ STEPS, item, setSelectedRepo, setStep, setLoadingMsg, setError, setScanHistory }) {
  setSelectedRepo(item.value);
  setStep(STEPS.LOADING);
  setLoadingMsg(`Loading scan history for ${item.value.full_name}…`);
  const res = await getScanHistory(item.value.full_name);
  if (!res.success) {
    setError(res.error || 'Failed to fetch scan history', STEPS.SELECT_REPO);
    return;
  }
  const history = res.scanHistory || [];
  process.stderr.write('SCAN_HISTORY_SAMPLE: ' + JSON.stringify(history.slice(0, 15), null, 2) + '\n');
  setScanHistory(history);
  setStep(STEPS.SELECT_SCAN);
}
