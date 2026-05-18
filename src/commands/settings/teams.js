import { fetchApi } from '../../utils/fetchApi.js';

export async function runTeamsChannels() {
  return fetchApi('/extension/integration/teams/channels', 'POST', {});
}

export async function runTeamsChannelGet() {
  return fetchApi('/extension/integration/teams/channel/get', 'POST', {});
}
