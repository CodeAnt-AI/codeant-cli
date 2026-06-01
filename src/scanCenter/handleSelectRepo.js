import { getScanHistory } from '../scans/getScanHistory.js';

export async function handleSelectRepo({ STEPS, item, selectedConnection, setSelectedRepo, setStep, setLoadingMsg, setError, setScanHistory }) {
  setSelectedRepo(item.value);
  setStep(STEPS.LOADING);
  const orgName = selectedConnection?.organizationName;
  const repoName = item.value.name;
  const repoFullName = item.value.full_name || (orgName && repoName ? `${orgName}/${repoName}` : repoName);
  if (!repoFullName || !repoFullName.includes('/')) {
    setError(`Cannot resolve repository in org/repo form (got "${repoFullName}")`, STEPS.SELECT_REPO);
    return;
  }
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
