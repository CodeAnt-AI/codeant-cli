import { listRepos } from '../scans/listRepos.js';

export async function handleSelectConnection({ STEPS, item, setSelectedConnection, setStep, setLoadingMsg, setError, setRepos }) {
  setSelectedConnection(item.value);
  setStep(STEPS.LOADING);
  setLoadingMsg(`Fetching repos for ${item.value.organizationName}…`);
  const res = await listRepos(item.value.organizationName);
  if (!res.success) {
    setError(res.error || 'Failed to fetch repos', STEPS.SELECT_CONNECTION);
    return;
  }
  setRepos(res.repos || []);
  setStep(STEPS.SELECT_REPO);
}
