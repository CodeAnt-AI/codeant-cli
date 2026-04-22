import { validateConnection } from '../scans/connectionHandler.js';

export async function validateConnectionOnMount({ STEPS, setError, setConnections, setStep }) {
  const res = await validateConnection();
  if (!res.success) {
    setError(res.error || 'Failed to validate connection', null);
    return;
  }
  if (!res.connections || res.connections.length === 0) {
    setError('No connected organisations found. Please log in to CodeAnt first.', null);
    return;
  }
  setConnections(res.connections);
  setStep(STEPS.SELECT_CONNECTION);
}
