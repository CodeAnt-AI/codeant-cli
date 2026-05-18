import { fetchApi } from '../../utils/fetchApi.js';

export async function runSlackChannels() {
  return fetchApi('/extension/integration/slack/channels', 'POST', {});
}

export async function runSlackChannelGet() {
  return fetchApi('/extension/integration/slack/channel/get', 'POST', {});
}
